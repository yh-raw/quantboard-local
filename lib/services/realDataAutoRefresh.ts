import { DEFAULT_SYNC_DAYS, DEFAULT_TIMEFRAME } from "@/lib/constants";
import { normalizeTicker } from "@/lib/ticker";
import { syncMarketBars } from "@/lib/services/marketSync";

const AUTO_REAL_SYNC_TTL_MS = 6 * 60 * 60 * 1000;

declare global {
  var realSyncAtMap: Map<string, number> | undefined;
  var realSyncInFlightMap: Map<string, Promise<void>> | undefined;
}

const syncAtMap = global.realSyncAtMap ?? new Map<string, number>();
const syncInFlightMap = global.realSyncInFlightMap ?? new Map<string, Promise<void>>();

if (!global.realSyncAtMap) {
  global.realSyncAtMap = syncAtMap;
}
if (!global.realSyncInFlightMap) {
  global.realSyncInFlightMap = syncInFlightMap;
}

function buildKey(ticker: string) {
  return `${ticker}:${DEFAULT_TIMEFRAME}`;
}

function isFresh(key: string) {
  const ts = syncAtMap.get(key);
  if (!ts) {
    return false;
  }
  return Date.now() - ts < AUTO_REAL_SYNC_TTL_MS;
}

export async function ensureTickerRealDataFresh(tickerRaw: string) {
  const ticker = normalizeTicker(tickerRaw);
  if (!ticker) {
    return;
  }

  const key = buildKey(ticker);
  if (isFresh(key)) {
    return;
  }

  const existing = syncInFlightMap.get(key);
  if (existing) {
    await existing;
    return;
  }

  const syncPromise = (async () => {
    try {
      await syncMarketBars({
        ticker,
        timeframe: DEFAULT_TIMEFRAME,
        days: DEFAULT_SYNC_DAYS,
        source: "auto",
      });
      syncAtMap.set(key, Date.now());
    } catch (error) {
      // Prevent hammering remote source when failures happen continuously.
      syncAtMap.set(key, Date.now());
      console.error("[real-auto-refresh] ticker sync failed", { ticker, error });
    } finally {
      syncInFlightMap.delete(key);
    }
  })();

  syncInFlightMap.set(key, syncPromise);
  await syncPromise;
}

export async function ensureWatchlistRealDataFresh(tickers: string[]) {
  const normalized = Array.from(new Set(tickers.map((ticker) => normalizeTicker(ticker)).filter(Boolean)));
  await Promise.allSettled(normalized.map((ticker) => ensureTickerRealDataFresh(ticker)));
}
