import { z } from "zod";
import { ok, fail } from "@/lib/api-response";
import { handleApiError } from "@/lib/errors";
import { getBars } from "@/lib/repo/priceBarRepo";
import { normalizeTicker } from "@/lib/ticker";
import type { Timeframe } from "@/lib/types";
import { isValidTimeframe, normalizeTimeframe } from "@/lib/timeframe";

const querySchema = z.object({
  ticker: z.string().min(1),
  tf: z.string().default("1d"),
  limit: z.coerce.number().int().min(1).max(1000).default(200),
});

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const parsed = querySchema.safeParse({
      ticker: searchParams.get("ticker"),
      tf: searchParams.get("tf") ?? "1d",
      limit: searchParams.get("limit") ?? "200",
    });

    if (!parsed.success) {
      return fail("INVALID_QUERY", "Invalid query parameters", 400, parsed.error.flatten());
    }

    const ticker = normalizeTicker(parsed.data.ticker);
    const timeframe = normalizeTimeframe(parsed.data.tf) as Timeframe;
    if (!isValidTimeframe(timeframe)) {
      return fail("INVALID_TIMEFRAME", "Invalid timeframe", 400, { tf: parsed.data.tf });
    }

    const bars = await getBars(ticker, timeframe, parsed.data.limit);

    return ok({
      ticker,
      timeframe,
      bars: bars.map((bar) => ({
        ts: bar.ts.toISOString(),
        open: bar.open,
        high: bar.high,
        low: bar.low,
        close: bar.close,
        volume: bar.volume,
      })),
    });
  } catch (error) {
    return handleApiError(error, "api-market-bars");
  }
}

