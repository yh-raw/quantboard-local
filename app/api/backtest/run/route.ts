import { z } from "zod";
import { ok, fail } from "@/lib/api-response";
import { handleApiError } from "@/lib/errors";
import { normalizeTicker } from "@/lib/ticker";
import { getBars } from "@/lib/repo/priceBarRepo";
import { syncMarketBars } from "@/lib/services/marketSync";
import { runMaCrossBacktest } from "@/lib/backtest/engine";

const bodySchema = z
  .object({
    ticker: z.string().min(1),
    tf: z.literal("1d").default("1d"),
    lookbackDays: z.coerce.number().int().min(120).max(2000).default(720),
    shortWindow: z.coerce.number().int().min(2).max(200).default(20),
    longWindow: z.coerce.number().int().min(5).max(400).default(60),
    initialCapital: z.coerce.number().min(100).max(100000000).default(100000),
    feeBps: z.coerce.number().min(0).max(1000).default(10),
    riskFreeRatePct: z.coerce.number().min(0).max(30).default(2),
    source: z.enum(["auto", "real", "mock"]).default("auto"),
  })
  .refine((value) => value.shortWindow < value.longWindow, {
    message: "shortWindow must be less than longWindow",
    path: ["shortWindow"],
  });

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}));
    const parsed = bodySchema.safeParse(body);

    if (!parsed.success) {
      return fail("INVALID_BODY", "Invalid backtest payload", 400, parsed.error.flatten());
    }

    const ticker = normalizeTicker(parsed.data.ticker);
    const timeframe = parsed.data.tf;

    const syncResult = await syncMarketBars({
      ticker,
      timeframe,
      days: parsed.data.lookbackDays,
      source: parsed.data.source,
    });

    const bars = await getBars(ticker, timeframe, parsed.data.lookbackDays);
    const backtest = runMaCrossBacktest({
      bars: bars.map((bar) => ({ ts: bar.ts, close: bar.close })),
      strategy: {
        ticker,
        timeframe,
        shortWindow: parsed.data.shortWindow,
        longWindow: parsed.data.longWindow,
        initialCapital: parsed.data.initialCapital,
        feeBps: parsed.data.feeBps,
        riskFreeRatePct: parsed.data.riskFreeRatePct,
      },
    });

    return ok({
      sync: syncResult,
      ...backtest,
    });
  } catch (error) {
    return handleApiError(error, "api-backtest-run");
  }
}
