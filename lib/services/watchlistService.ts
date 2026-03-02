import { DEFAULT_DEMO_TICKERS, DEFAULT_TIMEFRAME } from "@/lib/constants";
import { getLatestTwoBarsByTickers } from "@/lib/repo/priceBarRepo";
import { addWatchlistItem, listWatchlistItems } from "@/lib/repo/watchlistRepo";
import type { WatchlistOverviewItem } from "@/lib/types";

export async function getWatchlistOverview(userId: string): Promise<WatchlistOverviewItem[]> {
  const items = await listWatchlistItems(userId);
  const tickers = items.map((item) => item.ticker);
  const latestMap = await getLatestTwoBarsByTickers(tickers, DEFAULT_TIMEFRAME);

  return items.map((item) => {
    const pair = latestMap.get(item.ticker);
    const latest = pair?.latest ?? null;
    const previous = pair?.previous ?? null;

    let changePct: number | null = null;
    if (latest && previous && previous.close !== 0) {
      changePct = ((latest.close - previous.close) / previous.close) * 100;
    }

    return {
      ticker: item.ticker,
      latestClose: latest?.close ?? null,
      changePct,
      updatedAt: latest?.ts.toISOString() ?? null,
    };
  });
}

export async function bootstrapUserWatchlist(userId: string) {
  const current = await listWatchlistItems(userId);
  if (current.length > 0) {
    return;
  }

  for (const ticker of DEFAULT_DEMO_TICKERS) {
    await addWatchlistItem(userId, ticker);
  }

  console.info("[bootstrap] user watchlist initialized", { userId, tickers: DEFAULT_DEMO_TICKERS });
}

