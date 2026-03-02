import type { AlertSignalType } from "@prisma/client";
import { DEFAULT_SYNC_DAYS, DEFAULT_TIMEFRAME } from "@/lib/constants";
import { AppError } from "@/lib/errors";
import { detectSignals } from "@/lib/indicators/signals";
import { getBars } from "@/lib/repo/priceBarRepo";
import {
  createAlertDelivery,
  findAlertDelivery,
  listActiveAlertSubscriptions,
  listRecentAlertDeliveries,
} from "@/lib/repo/alertRepo";
import { dispatchAlert } from "@/lib/alerts/notifier";
import { syncMarketBars, type MarketSyncSource } from "@/lib/services/marketSync";

export async function runAlertScan(params?: {
  userId?: string;
  forceSync?: boolean;
  source?: MarketSyncSource;
}) {
  const userId = params?.userId;
  if (!userId) {
    throw new AppError("UNAUTHORIZED", 401, "Authentication required");
  }

  const forceSync = params?.forceSync ?? true;
  const source = params?.source ?? "auto";

  const subscriptions = await listActiveAlertSubscriptions(userId);
  if (!subscriptions.length) {
    return {
      scanned: 0,
      triggered: 0,
      failed: 0,
      skippedNoSignal: 0,
      skippedDuplicate: 0,
      deliveries: [],
    };
  }

  const tickers = Array.from(new Set(subscriptions.map((item) => item.ticker)));

  if (forceSync) {
    await Promise.allSettled(
      tickers.map((ticker) =>
        syncMarketBars({
          ticker,
          timeframe: DEFAULT_TIMEFRAME,
          days: DEFAULT_SYNC_DAYS,
          source,
        }),
      ),
    );
  }

  const barsByTicker = new Map<string, Awaited<ReturnType<typeof getBars>>>();
  for (const ticker of tickers) {
    const bars = await getBars(ticker, DEFAULT_TIMEFRAME, 300);
    barsByTicker.set(ticker, bars);
  }

  let triggered = 0;
  let failed = 0;
  let skippedNoSignal = 0;
  let skippedDuplicate = 0;

  for (const sub of subscriptions) {
    const bars = barsByTicker.get(sub.ticker) ?? [];
    if (bars.length < 30) {
      skippedNoSignal += 1;
      continue;
    }

    const signals = detectSignals(
      bars.map((bar) => bar.ts.toISOString()),
      bars.map((bar) => bar.close),
    );

    const matched = [...signals].reverse().find((signal) => {
      if (!sub.signalType) {
        return true;
      }
      return signal.type === sub.signalType;
    });

    if (!matched) {
      skippedNoSignal += 1;
      continue;
    }

    const signalType = matched.type as AlertSignalType;
    const signalTs = new Date(matched.ts);
    const existing = await findAlertDelivery({
      subscriptionId: sub.id,
      signalType,
      signalTs,
    });

    if (existing) {
      skippedDuplicate += 1;
      continue;
    }

    try {
      const dispatchResult = await dispatchAlert({
        ticker: sub.ticker,
        channel: sub.channel,
        target: sub.target,
        signalType: matched.type,
        signalTs: matched.ts,
        signalPrice: matched.price,
        subscriptionId: sub.id,
      });

      await createAlertDelivery({
        subscriptionId: sub.id,
        signalType,
        signalTs,
        signalPrice: matched.price,
        status: "SENT",
        message: dispatchResult.message,
      });

      triggered += 1;
    } catch (error) {
      await createAlertDelivery({
        subscriptionId: sub.id,
        signalType,
        signalTs,
        signalPrice: matched.price,
        status: "FAILED",
        message: error instanceof Error ? error.message : String(error),
      });

      failed += 1;
      console.error("[alert-scan] dispatch failed", {
        subscriptionId: sub.id,
        ticker: sub.ticker,
        error,
      });
    }
  }

  const deliveries = await listRecentAlertDeliveries(userId, 20);

  return {
    scanned: subscriptions.length,
    triggered,
    failed,
    skippedNoSignal,
    skippedDuplicate,
    deliveries: deliveries.map((item) => ({
      id: item.id,
      ticker: item.subscription.ticker,
      channel: item.subscription.channel,
      status: item.status,
      signalType: item.signalType,
      signalTs: item.signalTs.toISOString(),
      signalPrice: item.signalPrice,
      sentAt: item.sentAt.toISOString(),
      message: item.message,
    })),
  };
}

