import { calcBollingerBands } from "@/lib/indicators/boll";
import { calcMovingAverage } from "@/lib/indicators/ma";

export type SignalType = "MA_CROSS_UP" | "MA_CROSS_DOWN" | "BOLL_BREAK_UP" | "BOLL_BREAK_DOWN";

export type IndicatorSignal = {
  index: number;
  ts: string;
  price: number;
  type: SignalType;
};

export function detectSignals(ts: string[], closes: number[]) {
  const ma20 = calcMovingAverage(closes, 20);
  const { upper, lower } = calcBollingerBands(closes, 20, 2);
  const signals: IndicatorSignal[] = [];

  for (let i = 1; i < closes.length; i += 1) {
    const prevClose = closes[i - 1];
    const close = closes[i];
    const prevMa = ma20[i - 1];
    const ma = ma20[i];

    if (prevMa !== null && ma !== null) {
      if (prevClose <= prevMa && close > ma) {
        signals.push({ index: i, ts: ts[i], price: close, type: "MA_CROSS_UP" });
      }
      if (prevClose >= prevMa && close < ma) {
        signals.push({ index: i, ts: ts[i], price: close, type: "MA_CROSS_DOWN" });
      }
    }

    const up = upper[i];
    const low = lower[i];
    if (up !== null && close > up) {
      signals.push({ index: i, ts: ts[i], price: close, type: "BOLL_BREAK_UP" });
    }
    if (low !== null && close < low) {
      signals.push({ index: i, ts: ts[i], price: close, type: "BOLL_BREAK_DOWN" });
    }
  }

  return signals;
}

