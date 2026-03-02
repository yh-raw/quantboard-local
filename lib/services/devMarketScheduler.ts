import { runMarketSyncCronCycle } from "@/lib/services/marketSyncQueue";

declare global {
  var marketSyncDevSchedulerTimer: NodeJS.Timeout | undefined;
  var marketSyncDevSchedulerStartedAt: number | undefined;
}

function isTruthy(value: string | undefined) {
  if (!value) return false;
  const normalized = value.trim().toLowerCase();
  return normalized === "1" || normalized === "true" || normalized === "yes" || normalized === "on";
}

function shouldWarmupImmediately() {
  return isTruthy(process.env.MARKET_SYNC_DEV_WARMUP_IMMEDIATE);
}

function resolveIntervalMinutes() {
  const raw = Number(process.env.MARKET_SYNC_DEV_INTERVAL_MINUTES ?? "10");
  if (!Number.isFinite(raw)) {
    return 10;
  }
  return Math.min(Math.max(Math.trunc(raw), 1), 720);
}

export function startDevMarketSyncScheduler() {
  if (process.env.NODE_ENV !== "development") {
    return { started: false, reason: "not_development" } as const;
  }

  const explicitDisable = isTruthy(process.env.MARKET_SYNC_DEV_SCHEDULER_DISABLED);
  if (explicitDisable) {
    return { started: false, reason: "disabled_by_env" } as const;
  }

  if (global.marketSyncDevSchedulerTimer) {
    return { started: false, reason: "already_started" } as const;
  }

  const intervalMinutes = resolveIntervalMinutes();
  const intervalMs = intervalMinutes * 60 * 1000;

  const tick = async () => {
    try {
      const result = await runMarketSyncCronCycle();
      console.info("[dev-market-scheduler] cycle completed", {
        enqueueCreated: result.enqueueResult?.created ?? 0,
        claimed: result.processResult?.claimed ?? 0,
        succeeded: result.processResult?.succeeded ?? 0,
        failed: result.processResult?.failed ?? 0,
      });
    } catch (error) {
      console.error("[dev-market-scheduler] cycle failed", error);
    }
  };

  if (shouldWarmupImmediately()) {
    setTimeout(() => {
      void tick();
    }, 5000);
  }

  global.marketSyncDevSchedulerTimer = setInterval(() => {
    void tick();
  }, intervalMs);
  global.marketSyncDevSchedulerStartedAt = Date.now();

  console.info("[dev-market-scheduler] started", { intervalMinutes });
  return { started: true, intervalMinutes } as const;
}
