import { prisma } from "@/lib/db";
import { normalizeTicker } from "@/lib/ticker";
import { normalizeTimeframe } from "@/lib/timeframe";
import type { MarketSyncSource } from "@/lib/services/marketSync";
import type { Timeframe } from "@/lib/types";
import type { SyncJob, SyncJobStatus } from "@prisma/client";

const ACTIVE_QUEUE_STATUSES: SyncJobStatus[] = ["QUEUED", "RUNNING"];

function safeSource(source: string): MarketSyncSource {
  if (source === "real" || source === "mock") {
    return source;
  }
  return "auto";
}

export async function enqueueSyncJob(params: {
  ticker: string;
  timeframe: Timeframe;
  days: number;
  source: MarketSyncSource;
  priority?: number;
  runAfter?: Date;
  maxAttempts?: number;
}) {
  const ticker = normalizeTicker(params.ticker);
  const timeframe = normalizeTimeframe(params.timeframe);
  const days = Math.min(Math.max(Math.trunc(params.days), 1), 2000);
  const priority = Math.min(Math.max(Math.trunc(params.priority ?? 100), 1), 1000);
  const runAfter = params.runAfter ?? new Date();
  const maxAttempts = Math.min(Math.max(Math.trunc(params.maxAttempts ?? 3), 1), 10);

  const existing = await prisma.syncJob.findFirst({
    where: {
      ticker,
      timeframe,
      status: { in: ACTIVE_QUEUE_STATUSES },
    },
    orderBy: [{ createdAt: "desc" }],
  });

  if (existing) {
    return { created: false, job: existing };
  }

  const job = await prisma.syncJob.create({
    data: {
      ticker,
      timeframe,
      days,
      source: params.source,
      priority,
      runAfter,
      maxAttempts,
      status: "QUEUED",
    },
  });

  return { created: true, job };
}

export async function enqueueSyncJobs(
  jobs: Array<{
    ticker: string;
    timeframe: Timeframe;
    days: number;
    source: MarketSyncSource;
    priority?: number;
    runAfter?: Date;
    maxAttempts?: number;
  }>,
) {
  const results: Array<{ created: boolean; job: SyncJob }> = [];
  for (const job of jobs) {
    results.push(await enqueueSyncJob(job));
  }
  return results;
}

export async function claimDueSyncJobs(limit: number, workerId: string) {
  const now = new Date();
  const take = Math.min(Math.max(Math.trunc(limit), 1), 20);

  return prisma.$transaction(async (tx) => {
    const candidates = await tx.syncJob.findMany({
      where: {
        status: "QUEUED",
        runAfter: { lte: now },
      },
      orderBy: [{ priority: "asc" }, { runAfter: "asc" }, { createdAt: "asc" }],
      take,
    });

    const claimed: SyncJob[] = [];
    for (const candidate of candidates) {
      const updated = await tx.syncJob.updateMany({
        where: {
          id: candidate.id,
          status: "QUEUED",
        },
        data: {
          status: "RUNNING",
          lockedAt: now,
          lockedBy: workerId,
          startedAt: now,
          attempts: { increment: 1 },
        },
      });

      if (updated.count !== 1) {
        continue;
      }

      const claimedJob = await tx.syncJob.findUnique({
        where: { id: candidate.id },
      });

      if (claimedJob) {
        claimed.push(claimedJob);
      }
    }

    return claimed;
  });
}

export async function markSyncJobSucceeded(
  id: string,
  result: {
    provider: "real" | "mock";
    written: number;
  },
) {
  return prisma.syncJob.update({
    where: { id },
    data: {
      status: "SUCCEEDED",
      provider: result.provider,
      written: result.written,
      finishedAt: new Date(),
      lockedAt: null,
      lockedBy: null,
      lastError: null,
    },
  });
}

export async function markSyncJobFailed(id: string, errorMessage: string) {
  const current = await prisma.syncJob.findUnique({ where: { id } });
  if (!current) {
    return null;
  }

  const shouldRetry = current.attempts < current.maxAttempts;
  if (!shouldRetry) {
    return prisma.syncJob.update({
      where: { id },
      data: {
        status: "FAILED",
        finishedAt: new Date(),
        lockedAt: null,
        lockedBy: null,
        lastError: errorMessage.slice(0, 1000),
      },
    });
  }

  const retryDelaySeconds = Math.min(30 * 2 ** Math.max(current.attempts - 1, 0), 3600);
  const retryAt = new Date(Date.now() + retryDelaySeconds * 1000);

  return prisma.syncJob.update({
    where: { id },
    data: {
      status: "QUEUED",
      runAfter: retryAt,
      lockedAt: null,
      lockedBy: null,
      lastError: errorMessage.slice(0, 1000),
    },
  });
}

export async function recoverStaleRunningJobs(staleMinutes = 20) {
  const threshold = new Date(Date.now() - staleMinutes * 60 * 1000);
  const recovered = await prisma.syncJob.updateMany({
    where: {
      status: "RUNNING",
      lockedAt: { lt: threshold },
    },
    data: {
      status: "QUEUED",
      runAfter: new Date(),
      lockedAt: null,
      lockedBy: null,
      lastError: "Recovered stale running job",
    },
  });

  return recovered.count;
}

export async function getSyncQueueStats() {
  const [rows, dueCount, runningCount, failedCount, recentJobs] = await Promise.all([
    prisma.syncJob.groupBy({
      by: ["status"],
      _count: { _all: true },
    }),
    prisma.syncJob.count({
      where: {
        status: "QUEUED",
        runAfter: { lte: new Date() },
      },
    }),
    prisma.syncJob.count({ where: { status: "RUNNING" } }),
    prisma.syncJob.count({ where: { status: "FAILED" } }),
    prisma.syncJob.findMany({
      orderBy: [{ createdAt: "desc" }],
      take: 20,
    }),
  ]);

  const counts = {
    QUEUED: 0,
    RUNNING: 0,
    SUCCEEDED: 0,
    FAILED: 0,
  };

  for (const row of rows) {
    counts[row.status] = row._count._all;
  }

  return {
    counts,
    dueCount,
    runningCount,
    failedCount,
    recentJobs: recentJobs.map((job) => ({
      id: job.id,
      ticker: job.ticker,
      timeframe: job.timeframe,
      days: job.days,
      source: safeSource(job.source),
      status: job.status,
      attempts: job.attempts,
      maxAttempts: job.maxAttempts,
      runAfter: job.runAfter.toISOString(),
      createdAt: job.createdAt.toISOString(),
      updatedAt: job.updatedAt.toISOString(),
      startedAt: job.startedAt?.toISOString() ?? null,
      finishedAt: job.finishedAt?.toISOString() ?? null,
      lockedBy: job.lockedBy,
      lastError: job.lastError,
      provider: job.provider,
      written: job.written,
    })),
  };
}

