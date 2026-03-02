import { ok } from "@/lib/api-response";
import { handleApiError } from "@/lib/errors";
import { requireUserId } from "@/lib/auth/user";
import { listWatchlistTickers } from "@/lib/repo/watchlistRepo";
import { ensureWatchlistRealDataFresh } from "@/lib/services/realDataAutoRefresh";
import { bootstrapUserWatchlist, getWatchlistOverview } from "@/lib/services/watchlistService";

export async function GET() {
  try {
    const userId = await requireUserId();
    await bootstrapUserWatchlist(userId);
    const tickers = await listWatchlistTickers(userId);
    await ensureWatchlistRealDataFresh(tickers);
    const items = await getWatchlistOverview(userId);
    return ok({ items });
  } catch (error) {
    return handleApiError(error, "api-watchlist-get");
  }
}

