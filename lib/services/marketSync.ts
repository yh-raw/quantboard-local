import { AppError } from "@/lib/errors";
import { normalizeTicker } from "@/lib/ticker";
import { generateMockBars } from "@/lib/data/mockMarket";
import { fetchRealBars } from "@/lib/data/realMarket";
import { deleteBarsByTickerTimeframe, getLatestBar, upsertPriceBars } from "@/lib/repo/priceBarRepo";
import type { Timeframe } from "@/lib/types";
import { isValidTimeframe, normalizeTimeframe } from "@/lib/timeframe";

export type MarketSyncSource = "auto" | "real" | "mock";

export async function syncMarketBars(params: {
  ticker: string;
  timeframe: Timeframe;
  days: number;
  source?: MarketSyncSource;
}) {
  const ticker = normalizeTicker(params.ticker);
  const timeframe = normalizeTimeframe(params.timeframe) as Timeframe;
  const days = Math.min(Math.max(params.days, 1), 2000);
  const source = params.source ?? "auto";

  if (!ticker) {
    throw new AppError("INVALID_TICKER", 400, "Ticker is required");
  }
  if (!isValidTimeframe(timeframe)) {
    throw new AppError("INVALID_TIMEFRAME", 400, "Invalid timeframe", { timeframe: params.timeframe });
  }

  const latest = await getLatestBar(ticker, timeframe);

  let bars: ReturnType<typeof generateMockBars> = [];
  let provider: "real" | "mock" = "mock";
  let fallbackReason: string | null = null;

  if (source !== "mock") {
    try {
      bars = await fetchRealBars({
        ticker,
        timeframe,
        days,
      });

      if (bars.length > 0) {
        provider = "real";
      } else {
        if (source === "real") {
          throw new AppError("REAL_SOURCE_EMPTY", 502, "Real source returned no data", {
            ticker,
            timeframe,
          });
        }
        fallbackReason = "real_source_empty_data";
      }
    } catch (error) {
      if (source === "real") {
        if (error instanceof AppError) {
          throw error;
        }
        throw new AppError("REAL_SOURCE_FAILED", 502, "Failed to fetch real market data", {
          ticker,
          timeframe,
          reason: error instanceof Error ? error.message : String(error),
        });
      }
      fallbackReason = error instanceof Error ? error.message : String(error);
      console.error("[market-sync] real source failed, falling back to mock", {
        ticker,
        timeframe,
        fallbackReason,
      });
    }
  }

  if (source === "mock" || provider !== "real") {
    if (fallbackReason) {
      console.info("[market-sync] using mock fallback", { ticker, timeframe, fallbackReason });
    }

    bars = generateMockBars({
      ticker,
      timeframe,
      days,
      latestBarTs: latest?.ts,
      latestBarClose: latest?.close,
    });
    provider = "mock";
  }

  if (provider === "real" && bars.length > 0 && days >= 180) {
    // For full refresh jobs, replace old bars to avoid long-term mixed mock/real history.
    // Incremental jobs keep existing history and rely on upsert for new bars.
    await deleteBarsByTickerTimeframe(ticker, timeframe);
  }

  const written = await upsertPriceBars(bars);

  console.info("[market-sync] done", { ticker, timeframe, days, written, provider, source });
  return {
    ticker,
    timeframe,
    requestedDays: days,
    written,
    provider,
    source,
    fallbackReason,
    newestTs: bars.at(-1)?.ts.toISOString() ?? latest?.ts.toISOString() ?? null,
  };
}

export async function syncMockMarketBars(params: {
  ticker: string;
  timeframe: Timeframe;
  days: number;
}) {
  return syncMarketBars({
    ...params,
    source: "mock",
  });
}
