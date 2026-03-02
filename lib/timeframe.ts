import type { Timeframe } from "@/lib/types";

export const PRESET_TIMEFRAMES = ["1m", "5m", "15m", "1h", "4h", "1d", "1w", "1M"] as const;
export const BINANCE_NATIVE_TIMEFRAMES = [
  "1m",
  "3m",
  "5m",
  "15m",
  "30m",
  "1h",
  "2h",
  "4h",
  "6h",
  "8h",
  "12h",
  "1d",
  "3d",
  "1w",
  "1M",
] as const;

export const STOOQ_NATIVE_TIMEFRAMES = ["1d", "1w", "1M"] as const;

type TimeUnit = "m" | "h" | "d" | "w" | "M";

export function normalizeTimeframe(input: string | null | undefined): Timeframe {
  const raw = (input ?? "").trim();
  if (!raw) {
    return "1d";
  }

  const match = raw.match(/^(\d+)([a-zA-Z])$/);
  if (!match) {
    return raw;
  }

  const amount = Number(match[1]);
  if (!Number.isFinite(amount) || amount <= 0) {
    return raw;
  }

  const unitRaw = match[2];
  const unit = unitRaw === "M" ? "M" : unitRaw.toLowerCase();
  if (!["m", "h", "d", "w", "M"].includes(unit)) {
    return raw;
  }

  return `${amount}${unit}` as Timeframe;
}

export function parseTimeframe(timeframe: string): { amount: number; unit: TimeUnit } | null {
  const normalized = normalizeTimeframe(timeframe);
  const match = normalized.match(/^([1-9]\d{0,2})(m|h|d|w|M)$/);
  if (!match) {
    return null;
  }

  const amount = Number(match[1]);
  const unit = match[2] as TimeUnit;
  return { amount, unit };
}

export function isValidTimeframe(timeframe: string): timeframe is Timeframe {
  return parseTimeframe(timeframe) !== null;
}

export function isBinanceNativeTimeframe(timeframe: string): boolean {
  const normalized = normalizeTimeframe(timeframe);
  return (BINANCE_NATIVE_TIMEFRAMES as readonly string[]).includes(normalized);
}

export function isStooqNativeTimeframe(timeframe: string): boolean {
  const normalized = normalizeTimeframe(timeframe);
  return (STOOQ_NATIVE_TIMEFRAMES as readonly string[]).includes(normalized);
}

export function timeframeToMinutes(timeframe: string): number | null {
  const parsed = parseTimeframe(timeframe);
  if (!parsed) {
    return null;
  }

  const { amount, unit } = parsed;
  if (unit === "m") return amount;
  if (unit === "h") return amount * 60;
  if (unit === "d") return amount * 60 * 24;
  if (unit === "w") return amount * 60 * 24 * 7;
  return amount * 60 * 24 * 30;
}

export function estimateBarsForDays(timeframe: string, days: number): number {
  const minutes = timeframeToMinutes(timeframe);
  if (!minutes) {
    return Math.min(Math.max(days, 30), 2000);
  }

  const desired = Math.ceil((Math.max(days, 1) * 1440) / minutes);
  const minBars = minutes < 1440 ? 240 : 30;
  return Math.min(Math.max(desired, minBars), 2000);
}

export function estimateDaysForBars(timeframe: string, bars = 320): number {
  const minutes = timeframeToMinutes(timeframe);
  if (!minutes) {
    return 240;
  }

  const estimated = Math.ceil((Math.max(bars, 1) * minutes) / 1440);
  return Math.min(Math.max(estimated, 1), 2000);
}

