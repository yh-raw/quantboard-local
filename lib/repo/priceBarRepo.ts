import { prisma } from "@/lib/db";
import type { PriceBar } from "@prisma/client";
import type { PriceBarInput, Timeframe } from "@/lib/types";

export async function upsertPriceBars(bars: PriceBarInput[]) {
  if (!bars.length) {
    return 0;
  }

  const operations = bars.map((bar) =>
    prisma.priceBar.upsert({
      where: {
        ticker_timeframe_ts: {
          ticker: bar.ticker,
          timeframe: bar.timeframe,
          ts: bar.ts,
        },
      },
      update: {
        open: bar.open,
        high: bar.high,
        low: bar.low,
        close: bar.close,
        volume: bar.volume,
      },
      create: bar,
    }),
  );

  await prisma.$transaction(operations);
  return bars.length;
}

export async function getBars(ticker: string, timeframe: Timeframe, limit: number) {
  const rows = await prisma.priceBar.findMany({
    where: { ticker, timeframe },
    orderBy: { ts: "desc" },
    take: limit,
  });

  return rows.reverse();
}

export async function getLatestBar(ticker: string, timeframe: Timeframe) {
  return prisma.priceBar.findFirst({
    where: { ticker, timeframe },
    orderBy: { ts: "desc" },
  });
}

export async function getLatestTwoBarsByTickers(tickers: string[], timeframe: Timeframe) {
  if (!tickers.length) {
    return new Map<string, { latest: PriceBar | null; previous: PriceBar | null }>();
  }

  const rows = await prisma.priceBar.findMany({
    where: {
      ticker: { in: tickers },
      timeframe,
    },
    orderBy: [{ ticker: "asc" }, { ts: "desc" }],
  });

  const grouped = new Map<string, { latest: PriceBar | null; previous: PriceBar | null }>();

  for (const ticker of tickers) {
    grouped.set(ticker, { latest: null, previous: null });
  }

  for (const row of rows) {
    const bucket = grouped.get(row.ticker);
    if (!bucket) {
      continue;
    }

    if (bucket.latest === null) {
      bucket.latest = row;
      continue;
    }

    if (bucket.previous === null) {
      bucket.previous = row;
    }
  }

  return grouped;
}

export async function listTickersWithBars(timeframe: Timeframe) {
  const rows = await prisma.priceBar.findMany({
    select: { ticker: true },
    where: { timeframe },
    distinct: ["ticker"],
    orderBy: { ticker: "asc" },
  });

  return rows.map((row) => row.ticker);
}

export async function deleteBarsByTickerTimeframe(ticker: string, timeframe: Timeframe) {
  return prisma.priceBar.deleteMany({
    where: {
      ticker,
      timeframe,
    },
  });
}

