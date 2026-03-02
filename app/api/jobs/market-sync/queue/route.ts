import { z } from "zod";
import { ok, fail } from "@/lib/api-response";
import { handleApiError } from "@/lib/errors";
import { getSyncQueueStats } from "@/lib/repo/syncJobRepo";
import { enqueueWatchlistSyncJobs } from "@/lib/services/marketSyncQueue";
import { normalizeTimeframe } from "@/lib/timeframe";
import type { MarketSyncSource } from "@/lib/services/marketSync";

const bodySchema = z.object({
  timeframe: z.string().optional(),
  days: z.coerce.number().int().min(1).max(2000).optional(),
  source: z.enum(["auto", "real", "mock"]).optional(),
  priority: z.coerce.number().int().min(1).max(1000).optional(),
  tickers: z.array(z.string().min(1)).max(200).optional(),
});

export async function GET() {
  try {
    const stats = await getSyncQueueStats();
    return ok(stats);
  } catch (error) {
    return handleApiError(error, "api-market-sync-queue-get");
  }
}

export async function POST(request: Request) {
  try {
    const json = await request.json().catch(() => ({}));
    const parsed = bodySchema.safeParse(json);

    if (!parsed.success) {
      return fail("INVALID_BODY", "Invalid queue payload", 400, parsed.error.flatten());
    }

    const enqueueResult = await enqueueWatchlistSyncJobs({
      timeframe: normalizeTimeframe(parsed.data.timeframe),
      days: parsed.data.days,
      source: (parsed.data.source ?? "auto") as MarketSyncSource,
      priority: parsed.data.priority,
      tickers: parsed.data.tickers,
    });
    const stats = await getSyncQueueStats();

    return ok({
      enqueue: enqueueResult,
      queueStats: stats,
    });
  } catch (error) {
    return handleApiError(error, "api-market-sync-queue-post");
  }
}

