import { calcMovingAverage } from "@/lib/indicators/ma";

export type BollResult = {
  mid: Array<number | null>;
  upper: Array<number | null>;
  lower: Array<number | null>;
};

export function calcBollingerBands(values: number[], period = 20, multiplier = 2): BollResult {
  const mid = calcMovingAverage(values, period);
  const upper: Array<number | null> = Array(values.length).fill(null);
  const lower: Array<number | null> = Array(values.length).fill(null);

  for (let i = period - 1; i < values.length; i += 1) {
    const slice = values.slice(i - period + 1, i + 1);
    const mean = mid[i] ?? 0;
    const variance = slice.reduce((acc, curr) => acc + (curr - mean) ** 2, 0) / period;
    const std = Math.sqrt(variance);

    upper[i] = mean + multiplier * std;
    lower[i] = mean - multiplier * std;
  }

  return { mid, upper, lower };
}

