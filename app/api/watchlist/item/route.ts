import { z } from "zod";
import { ok, fail } from "@/lib/api-response";
import { handleApiError } from "@/lib/errors";
import { requireUserId } from "@/lib/auth/user";
import { addWatchlistItem, removeWatchlistItem } from "@/lib/repo/watchlistRepo";
import { normalizeTicker } from "@/lib/ticker";

const postSchema = z.object({
  ticker: z.string().min(1),
});

export async function POST(request: Request) {
  try {
    const json = await request.json().catch(() => ({}));
    const parsed = postSchema.safeParse(json);

    if (!parsed.success) {
      return fail("INVALID_BODY", "Ticker is required", 400, parsed.error.flatten());
    }

    const userId = await requireUserId();
    const ticker = normalizeTicker(parsed.data.ticker);
    const item = await addWatchlistItem(userId, ticker);

    console.info("[watchlist] added", { userId, ticker });
    return ok({ item });
  } catch (error) {
    return handleApiError(error, "api-watchlist-post-item");
  }
}

export async function DELETE(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const rawTicker = searchParams.get("ticker");

    if (!rawTicker) {
      return fail("INVALID_QUERY", "ticker query param is required", 400);
    }

    const userId = await requireUserId();
    const ticker = normalizeTicker(rawTicker);
    const removed = await removeWatchlistItem(userId, ticker);

    console.info("[watchlist] deleted", { userId, ticker, removed: removed.count });
    return ok({ removed: removed.count });
  } catch (error) {
    return handleApiError(error, "api-watchlist-delete-item");
  }
}

