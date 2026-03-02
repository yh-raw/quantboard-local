import { z } from "zod";
import { ok, fail } from "@/lib/api-response";
import { handleApiError } from "@/lib/errors";
import { getSyncQueueStats } from "@/lib/repo/syncJobRepo";
import { processSyncJobQueue } from "@/lib/services/marketSyncQueue";

const bodySchema = z.object({
  limit: z.coerce.number().int().min(1).max(20).optional(),
  workerId: z.string().min(1).max(100).optional(),
});

export async function POST(request: Request) {
  try {
    const json = await request.json().catch(() => ({}));
    const parsed = bodySchema.safeParse(json);
    if (!parsed.success) {
      return fail("INVALID_BODY", "Invalid run payload", 400, parsed.error.flatten());
    }

    const runResult = await processSyncJobQueue({
      limit: parsed.data.limit,
      workerId: parsed.data.workerId,
    });
    const stats = await getSyncQueueStats();

    return ok({
      run: runResult,
      queueStats: stats,
    });
  } catch (error) {
    return handleApiError(error, "api-market-sync-run");
  }
}

