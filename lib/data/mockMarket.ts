import { estimateBarsForDays, parseTimeframe, timeframeToMinutes } from "@/lib/timeframe";
import type { PriceBarInput, Timeframe } from "@/lib/types";

function randomBetween(min: number, max: number) {
  return Math.random() * (max - min) + min;
}

function round2(value: number) {
  return Math.round(value * 100) / 100;
}

function seedPriceForTicker(ticker: string) {
  if (ticker.includes("BTC")) return 42000;
  if (ticker === "TSLA") return 210;
  if (ticker === "SPY") return 540;
  if (ticker === "AAPL") return 190;
  return 100;
}

function addTimeframe(date: Date, timeframe: Timeframe, step = 1) {
  const parsed = parseTimeframe(timeframe);
  if (!parsed) {
    return new Date(date.getTime() + step * 24 * 60 * 60 * 1000);
  }

  const size = parsed.amount * step;
  if (parsed.unit === "M") {
    const year = date.getUTCFullYear();
    const month = date.getUTCMonth();
    return new Date(
      Date.UTC(
        year,
        month + size,
        date.getUTCDate(),
        date.getUTCHours(),
        date.getUTCMinutes(),
        0,
        0,
      ),
    );
  }

  const minutes = timeframeToMinutes(timeframe) ?? 1440;
  return new Date(date.getTime() + step * minutes * 60 * 1000);
}

function alignToTimeframe(date: Date, timeframe: Timeframe) {
  const parsed = parseTimeframe(timeframe);
  if (!parsed) {
    return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  }

  if (parsed.unit === "m") {
    const minute = Math.floor(date.getUTCMinutes() / parsed.amount) * parsed.amount;
    return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate(), date.getUTCHours(), minute, 0, 0));
  }

  if (parsed.unit === "h") {
    const hour = Math.floor(date.getUTCHours() / parsed.amount) * parsed.amount;
    return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate(), hour, 0, 0, 0));
  }

  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate(), 0, 0, 0, 0));
}

export function generateMockBars(args: {
  ticker: string;
  timeframe: Timeframe;
  days: number;
  latestBarTs?: Date;
  latestBarClose?: number;
}) {
  const { ticker, timeframe, days, latestBarTs, latestBarClose } = args;
  const bars: PriceBarInput[] = [];

  const targetBars = estimateBarsForDays(timeframe, days);
  const now = alignToTimeframe(new Date(), timeframe);
  const startTs = latestBarTs
    ? addTimeframe(alignToTimeframe(latestBarTs, timeframe), timeframe, 1)
    : addTimeframe(now, timeframe, -(targetBars - 1));

  let ts = startTs;
  let prevClose = latestBarClose ?? seedPriceForTicker(ticker);

  const minutes = timeframeToMinutes(timeframe) ?? 1440;
  const amplitude = minutes < 60 ? 0.006 : minutes < 1440 ? 0.015 : 0.03;

  for (let i = 0; i < targetBars; i += 1) {
    if (ts > now) {
      break;
    }

    const open = prevClose * (1 + randomBetween(-amplitude * 0.6, amplitude * 0.6));
    const close = open * (1 + randomBetween(-amplitude, amplitude));
    const high = Math.max(open, close) * (1 + randomBetween(0.001, amplitude * 0.75));
    const low = Math.min(open, close) * (1 - randomBetween(0.001, amplitude * 0.75));
    const volume = randomBetween(80_000, 5_000_000) * Math.max(0.2, Math.min(minutes / 1440, 4));

    const bar: PriceBarInput = {
      ticker,
      timeframe,
      ts,
      open: round2(open),
      high: round2(high),
      low: round2(low),
      close: round2(close),
      volume: Math.round(volume),
    };

    bars.push(bar);
    prevClose = bar.close;
    ts = addTimeframe(ts, timeframe, 1);
  }

  return bars;
}

