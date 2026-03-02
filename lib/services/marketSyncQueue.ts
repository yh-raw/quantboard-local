import { randomUUID } from "node:crypto";
import { DEFAULT_DEMO_TICKERS, DEFAULT_TIMEFRAME } from "@/lib/constants";
import { AppError } from "@/lib/errors";
import { listAllWatchlistTickers } from "@/lib/repo/watchlistRepo";
import {
  claimDueSyncJobs,
  enqueueSyncJobs,
  getSyncQueueStats,
  markSyncJobFailed,
  markSyncJobSucceeded,
  recoverStaleRunningJobs,
} from "@/lib/repo/syncJobRepo";
import { syncMarketBars, type MarketSyncSource } from "@/lib/services/marketSync";
import { normalizeTicker } from "@/lib/ticker";
import { isValidTimeframe, normalizeTimeframe } from "@/lib/timeframe";
import type { Timeframe } from "@/lib/types";

const DEFAULT_INCREMENTAL_SYNC_DAYS = Number(process.env.MARKET_SYNC_INCREMENTAL_DAYS ?? "7");
const DEFAULT_QUEUE_BATCH_SIZE = Number(process.env.MARKET_SYNC_QUEUE_BATCH ?? "4");

function normalizeSource(value?: string): MarketSyncSource {
  if (value === "real" || value === "mock") {
    return value;
  }
  return "auto";
}

function normalizeDays(value?: number) {
  const fallback = Number.isFinite(DEFAULT_INCREMENTAL_SYNC_DAYS) ? DEFAULT_INCREMENTAL_SYNC_DAYS : 7;
  const days = value ?? fallback;
  return Math.min(Math.max(Math.trunc(days), 1), 2000);
}

function normalizeBatchSize(value?: number) {
  const fallback = Number.isFinite(DEFAULT_QUEUE_BATCH_SIZE) ? DEFAULT_QUEUE_BATCH_SIZE : 4;
  const size = value ?? fallback;
  return Math.min(Math.max(Math.trunc(size), 1), 20);
}

export async function enqueueWatchlistSyncJobs(params?: {
  timeframe?: Timeframe;
  days?: number;
  source?: MarketSyncSource;
  priority?: number;
  tickers?: string[];
}) {
  const timeframe = normalizeTimeframe(params?.timeframe ?? DEFAULT_TIMEFRAME);
  if (!isValidTimeframe(timeframe)) {
    throw new AppError("INVALID_TIMEFRAME", 400, `Invalid timeframe: ${params?.timeframe}`);
  }

  const days = normalizeDays(params?.days);
  const source = normalizeSource(params?.source);

  let tickers = params?.tickers?.map((ticker) => normalizeTicker(ticker)).filter(Boolean) ?? [];
  if (tickers.length === 0) {
    tickers = await listAllWatchlistTickers();
  }
  if (tickers.length === 0) {
    tickers = DEFAULT_DEMO_TICKERS;
  }

  const uniqueTickers = Array.from(new Set(tickers));
  const queueResults = await enqueueSyncJobs(
    uniqueTickers.map((ticker) => ({
      ticker,
      timeframe,
      days,
      source,
      priority: params?.priority ?? 100,
    })),
  );

  const created = queueResults.filter((item) => item.created).length;
  return {
    timeframe,
    days,
    source,
    total: queueResults.length,
    created,
    deduped: queueResults.length - created,
    tickers: uniqueTickers,
  };
}

export async function processSyncJobQueue(params?: { limit?: number; workerId?: string }) {
  const limit = normalizeBatchSize(params?.limit);
  const workerId = params?.workerId?.trim() || `worker-${process.pid}-${randomUUID().slice(0, 8)}`;
  const recovered = await recoverStaleRunningJobs();
  const jobs = await claimDueSyncJobs(limit, workerId);

  let succeeded = 0;
  let failed = 0;
  const details: Array<{
    jobId: string;
    ticker: string;
    timeframe: string;
    status: "SUCCEEDED" | "FAILED";
    provider?: "real" | "mock";
    written?: number;
    error?: string;
  }> = [];

  for (const job of jobs) {
    try {
      const source = normalizeSource(job.source);
      const result = await syncMarketBars({
        ticker: job.ticker,
        timeframe: job.timeframe,
        days: job.days,
        source,
      });

      await markSyncJobSucceeded(job.id, {
        provider: result.provider,
        written: result.written,
      });

      succeeded += 1;
      details.push({
        jobId: job.id,
        ticker: job.ticker,
        timeframe: job.timeframe,
        status: "SUCCEEDED",
        provider: result.provider,
        written: result.written,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      await markSyncJobFailed(job.id, message);
      failed += 1;
      details.push({
        jobId: job.id,
        ticker: job.ticker,
        timeframe: job.timeframe,
        status: "FAILED",
        error: message,
      });
    }
  }

  return {
    workerId,
    recovered,
    claimed: jobs.length,
    succeeded,
    failed,
    details,
  };
}

export async function runMarketSyncCronCycle(params?: {
  timeframe?: Timeframe;
  days?: number;
  source?: MarketSyncSource;
  enqueueOnly?: boolean;
  processOnly?: boolean;
  limit?: number;
}) {
  const enqueueOnly = Boolean(params?.enqueueOnly);
  const processOnly = Boolean(params?.processOnly);

  const enqueueResult = processOnly
    ? null
    : await enqueueWatchlistSyncJobs({
        timeframe: params?.timeframe ?? DEFAULT_TIMEFRAME,
        days: params?.days ?? DEFAULT_INCREMENTAL_SYNC_DAYS,
        source: params?.source ?? "auto",
      });

  const processResult = enqueueOnly ? null : await processSyncJobQueue({ limit: params?.limit ?? DEFAULT_QUEUE_BATCH_SIZE });
  const queueStats = await getSyncQueueStats();

  return {
    enqueueResult,
    processResult,
    queueStats,
    timestamp: new Date().toISOString(),
  };
}
