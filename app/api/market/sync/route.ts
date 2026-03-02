import { z } from "zod";
import { ok, fail } from "@/lib/api-response";
import { handleApiError } from "@/lib/errors";
import { syncMarketBars } from "@/lib/services/marketSync";
import type { Timeframe } from "@/lib/types";
import { isValidTimeframe, normalizeTimeframe } from "@/lib/timeframe";

const bodySchema = z.object({
  ticker: z.string().min(1),
  tf: z.string().default("1d"),
  days: z.coerce.number().int().min(1).max(2000).default(240),
  source: z.enum(["auto", "real", "mock"]).default("auto"),
});

export async function POST(request: Request) {
  try {
    const json = await request.json().catch(() => ({}));
    const parsed = bodySchema.safeParse(json);

    if (!parsed.success) {
      return fail("INVALID_BODY", "Invalid sync payload", 400, parsed.error.flatten());
    }

    const timeframe = normalizeTimeframe(parsed.data.tf) as Timeframe;
    if (!isValidTimeframe(timeframe)) {
      return fail("INVALID_TIMEFRAME", "Invalid timeframe", 400, { tf: parsed.data.tf });
    }

    const result = await syncMarketBars({
      ticker: parsed.data.ticker,
      timeframe,
      days: parsed.data.days,
      source: parsed.data.source,
    });

    return ok(result);
  } catch (error) {
    return handleApiError(error, "api-market-sync");
  }
}
