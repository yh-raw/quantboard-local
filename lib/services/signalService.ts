import { getBars } from "@/lib/repo/priceBarRepo";
import { detectSignals } from "@/lib/indicators/signals";
import type { SignalType } from "@/lib/indicators/signals";
import { DEFAULT_TIMEFRAME } from "@/lib/constants";

export type RecentSignal = {
  ticker: string;
  ts: string;
  type: SignalType;
  price: number;
};

export async function getRecentSignals(tickers: string[], limit = 3): Promise<RecentSignal[]> {
  const checks = await Promise.all(
    tickers.map(async (ticker) => {
      const bars = await getBars(ticker, DEFAULT_TIMEFRAME, 120);
      if (bars.length < 21) {
        return null;
      }

      const ts = bars.map((bar) => bar.ts.toISOString());
      const closes = bars.map((bar) => bar.close);
      const signals = detectSignals(ts, closes);
      const latest = signals.at(-1);

      if (!latest) {
        return null;
      }

      return {
        ticker,
        ts: latest.ts,
        type: latest.type,
        price: latest.price,
      };
    }),
  );

  const filtered = checks.filter((item): item is NonNullable<(typeof checks)[number]> => item !== null);
  return filtered.sort((a, b) => (a.ts < b.ts ? 1 : -1)).slice(0, limit);
}
