import { AppError } from "@/lib/errors";
import {
  estimateBarsForDays,
  isBinanceNativeTimeframe,
  isStooqNativeTimeframe,
  isValidTimeframe,
  normalizeTimeframe,
  parseTimeframe,
} from "@/lib/timeframe";
import type { PriceBarInput, Timeframe } from "@/lib/types";

type FetchRealBarsArgs = {
  ticker: string;
  timeframe: Timeframe;
  days: number;
};

function toUtcDate(dateStr: string) {
  const parsed = new Date(`${dateStr}T00:00:00.000Z`);
  if (Number.isNaN(parsed.getTime())) {
    return null;
  }
  return parsed;
}

function toNumber(value: string) {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function mapTickerToStooqSymbol(ticker: string) {
  const t = ticker.toUpperCase().trim();

  if (t === "SPY") return "spy.us";
  if (/^[A-Z]+$/.test(t)) return `${t.toLowerCase()}.us`;

  return t.toLowerCase().replace("-", "");
}

function mapTickerToBinanceSymbol(ticker: string) {
  const t = ticker.toUpperCase().trim();
  if (!/^[A-Z0-9]+-USD$/.test(t)) {
    return null;
  }
  return `${t.replace("-USD", "")}USDT`;
}

function parseStooqCsv(csvText: string, ticker: string, timeframe: Timeframe) {
  const lines = csvText.trim().split(/\r?\n/);
  if (lines.length <= 1) {
    return [];
  }

  const parsed: PriceBarInput[] = [];
  for (let i = 1; i < lines.length; i += 1) {
    const line = lines[i]?.trim();
    if (!line) {
      continue;
    }

    const [date, openRaw, highRaw, lowRaw, closeRaw, volumeRaw] = line.split(",");
    if (!date || !openRaw || !highRaw || !lowRaw || !closeRaw || !volumeRaw) {
      continue;
    }
    if ([openRaw, highRaw, lowRaw, closeRaw, volumeRaw].some((v) => v === "N/D")) {
      continue;
    }

    const ts = toUtcDate(date);
    const open = toNumber(openRaw);
    const high = toNumber(highRaw);
    const low = toNumber(lowRaw);
    const close = toNumber(closeRaw);
    const volume = toNumber(volumeRaw);

    if (!ts || open === null || high === null || low === null || close === null || volume === null) {
      continue;
    }

    parsed.push({
      ticker,
      timeframe,
      ts,
      open,
      high,
      low,
      close,
      volume,
    });
  }

  return parsed.sort((a, b) => (a.ts < b.ts ? -1 : 1));
}

function parseBinanceKlines(klines: unknown, ticker: string, timeframe: Timeframe) {
  if (!Array.isArray(klines)) {
    return [];
  }

  const bars: PriceBarInput[] = [];
  for (const row of klines) {
    if (!Array.isArray(row) || row.length < 6) {
      continue;
    }

    const openTime = Number(row[0]);
    const open = Number(row[1]);
    const high = Number(row[2]);
    const low = Number(row[3]);
    const close = Number(row[4]);
    const volume = Number(row[5]);

    if (
      !Number.isFinite(openTime) ||
      !Number.isFinite(open) ||
      !Number.isFinite(high) ||
      !Number.isFinite(low) ||
      !Number.isFinite(close) ||
      !Number.isFinite(volume)
    ) {
      continue;
    }

    bars.push({
      ticker,
      timeframe,
      ts: new Date(openTime),
      open,
      high,
      low,
      close,
      volume,
    });
  }

  return bars.sort((a, b) => (a.ts < b.ts ? -1 : 1));
}

function aggregateBarsByCount(bars: PriceBarInput[], ticker: string, targetTimeframe: Timeframe, groupSize: number) {
  if (groupSize <= 1) {
    return bars.map((bar) => ({
      ...bar,
      ticker,
      timeframe: targetTimeframe,
    }));
  }

  const aggregated: PriceBarInput[] = [];
  for (let i = 0; i < bars.length; i += groupSize) {
    const group = bars.slice(i, i + groupSize);
    if (group.length === 0) {
      continue;
    }

    const first = group[0];
    const last = group[group.length - 1];

    let high = Number.NEGATIVE_INFINITY;
    let low = Number.POSITIVE_INFINITY;
    let volume = 0;

    for (const bar of group) {
      if (bar.high > high) {
        high = bar.high;
      }
      if (bar.low < low) {
        low = bar.low;
      }
      volume += bar.volume;
    }

    aggregated.push({
      ticker,
      timeframe: targetTimeframe,
      ts: first.ts,
      open: first.open,
      high,
      low,
      close: last.close,
      volume,
    });
  }

  return aggregated;
}

async function fetchBinanceKlinesPaged(symbol: string, interval: string, desiredBars: number) {
  const target = Math.min(Math.max(desiredBars, 1), 5000);
  const all: unknown[] = [];
  let endTime: number | null = null;

  while (all.length < target) {
    const limit = Math.min(1000, target - all.length);
    const url = new URL("https://api.binance.com/api/v3/klines");
    url.searchParams.set("symbol", symbol);
    url.searchParams.set("interval", interval);
    url.searchParams.set("limit", String(limit));
    if (endTime !== null) {
      url.searchParams.set("endTime", String(endTime));
    }

    const response = await fetch(url.toString(), {
      method: "GET",
      headers: { Accept: "application/json" },
      cache: "no-store",
    });

    if (!response.ok) {
      throw new Error(`binance_http_${response.status}`);
    }

    const batch = (await response.json()) as unknown;
    if (!Array.isArray(batch) || batch.length === 0) {
      break;
    }

    all.unshift(...batch);
    const firstOpen = Number((batch[0] as unknown[])[0]);
    if (!Number.isFinite(firstOpen)) {
      break;
    }
    endTime = firstOpen - 1;

    if (batch.length < limit) {
      break;
    }
  }

  return all.slice(-target);
}

function resolveBinancePlan(targetTimeframe: Timeframe): { fetchTimeframe: Timeframe; groupSize: number } | null {
  const normalized = normalizeTimeframe(targetTimeframe);

  if (isBinanceNativeTimeframe(normalized)) {
    return { fetchTimeframe: normalized, groupSize: 1 };
  }

  const parsed = parseTimeframe(normalized);
  if (!parsed) {
    return null;
  }

  const { amount, unit } = parsed;
  if (unit === "m") {
    return { fetchTimeframe: "1m", groupSize: amount };
  }
  if (unit === "h") {
    return { fetchTimeframe: "1h", groupSize: amount };
  }
  if (unit === "d") {
    return { fetchTimeframe: "1d", groupSize: amount };
  }
  if (unit === "w") {
    return { fetchTimeframe: "1d", groupSize: amount * 7 };
  }
  return { fetchTimeframe: "1M", groupSize: amount };
}

async function fetchBinanceBars(ticker: string, timeframe: Timeframe, days: number) {
  const symbol = mapTickerToBinanceSymbol(ticker);
  if (!symbol) {
    return null;
  }

  const plan = resolveBinancePlan(timeframe);
  if (!plan) {
    throw new AppError("UNSUPPORTED_TIMEFRAME", 400, `Unsupported timeframe: ${timeframe}`);
  }

  const desiredTargetBars = estimateBarsForDays(timeframe, days);
  const desiredSourceBars = Math.min(Math.max(desiredTargetBars * plan.groupSize + plan.groupSize, 120), 5000);
  const rawKlines = await fetchBinanceKlinesPaged(symbol, plan.fetchTimeframe, desiredSourceBars);
  const sourceBars = parseBinanceKlines(rawKlines, ticker, plan.fetchTimeframe);
  const aggregated = aggregateBarsByCount(sourceBars, ticker, timeframe, plan.groupSize);

  return aggregated.slice(-desiredTargetBars);
}

async function fetchStooqBars(ticker: string, timeframe: Timeframe, days: number) {
  if (!isStooqNativeTimeframe(timeframe)) {
    throw new AppError(
      "UNSUPPORTED_STOOQ_TIMEFRAME",
      400,
      `Stooq only supports 1d/1w/1M, current timeframe=${timeframe}`,
    );
  }

  const stooqSymbol = mapTickerToStooqSymbol(ticker);
  const interval = timeframe === "1d" ? "d" : timeframe === "1w" ? "w" : "m";
  const url = `https://stooq.com/q/d/l/?s=${encodeURIComponent(stooqSymbol)}&i=${interval}`;

  const response = await fetch(url, {
    method: "GET",
    headers: { Accept: "text/csv" },
    cache: "no-store",
  });

  if (!response.ok) {
    throw new Error(`stooq_http_${response.status}`);
  }

  const csv = await response.text();
  const bars = parseStooqCsv(csv, ticker, timeframe);
  const desiredBars = estimateBarsForDays(timeframe, days);
  return bars.slice(-desiredBars);
}

export async function fetchRealBars(args: FetchRealBarsArgs): Promise<PriceBarInput[]> {
  const ticker = args.ticker.toUpperCase().trim();
  const timeframe = normalizeTimeframe(args.timeframe);
  const days = Math.min(Math.max(args.days, 1), 2000);

  if (!isValidTimeframe(timeframe)) {
    throw new AppError("UNSUPPORTED_TIMEFRAME", 400, `Unsupported timeframe: ${args.timeframe}`);
  }

  const binanceBars = await fetchBinanceBars(ticker, timeframe, days).catch((error) => {
    console.error("[real-market] binance fetch failed", {
      ticker,
      timeframe,
      reason: error instanceof Error ? error.message : String(error),
    });
    return null;
  });

  if (binanceBars && binanceBars.length > 0) {
    return binanceBars;
  }

  const stooqBars = await fetchStooqBars(ticker, timeframe, days).catch((error) => {
    if (error instanceof AppError) {
      throw error;
    }
    console.error("[real-market] stooq fetch failed", {
      ticker,
      timeframe,
      reason: error instanceof Error ? error.message : String(error),
    });
    return [] as PriceBarInput[];
  });

  return stooqBars;
}

