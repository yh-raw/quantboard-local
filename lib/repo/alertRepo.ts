import { prisma } from "@/lib/db";
import type { AlertChannel, AlertSignalType } from "@prisma/client";

export async function listAlertSubscriptions(userId: string) {
  return prisma.alertSubscription.findMany({
    where: { userId },
    orderBy: { createdAt: "desc" },
    include: {
      deliveries: {
        orderBy: { sentAt: "desc" },
        take: 1,
      },
    },
  });
}

export async function createAlertSubscription(params: {
  userId: string;
  ticker: string;
  channel: AlertChannel;
  target?: string | null;
  signalType?: AlertSignalType | null;
}) {
  return prisma.alertSubscription.create({
    data: {
      userId: params.userId,
      ticker: params.ticker,
      channel: params.channel,
      target: params.target ?? null,
      signalType: params.signalType ?? null,
    },
  });
}

export async function updateAlertSubscriptionActive(params: {
  userId: string;
  id: string;
  isActive: boolean;
}) {
  return prisma.alertSubscription.updateMany({
    where: {
      id: params.id,
      userId: params.userId,
    },
    data: {
      isActive: params.isActive,
    },
  });
}

export async function deleteAlertSubscription(params: { userId: string; id: string }) {
  return prisma.alertSubscription.deleteMany({
    where: {
      id: params.id,
      userId: params.userId,
    },
  });
}

export async function listActiveAlertSubscriptions(userId: string) {
  return prisma.alertSubscription.findMany({
    where: {
      userId,
      isActive: true,
    },
    orderBy: { createdAt: "desc" },
  });
}

export async function findAlertDelivery(params: {
  subscriptionId: string;
  signalType: AlertSignalType;
  signalTs: Date;
}) {
  return prisma.alertDelivery.findFirst({
    where: {
      subscriptionId: params.subscriptionId,
      signalType: params.signalType,
      signalTs: params.signalTs,
    },
  });
}

export async function createAlertDelivery(params: {
  subscriptionId: string;
  signalType: AlertSignalType;
  signalTs: Date;
  signalPrice: number;
  status: "SENT" | "FAILED";
  message?: string | null;
}) {
  return prisma.alertDelivery.create({
    data: {
      subscriptionId: params.subscriptionId,
      signalType: params.signalType,
      signalTs: params.signalTs,
      signalPrice: params.signalPrice,
      status: params.status,
      message: params.message ?? null,
    },
  });
}

export async function listRecentAlertDeliveries(userId: string, take = 20) {
  return prisma.alertDelivery.findMany({
    where: {
      subscription: {
        userId,
      },
    },
    orderBy: { sentAt: "desc" },
    take,
    include: {
      subscription: {
        select: {
          ticker: true,
          channel: true,
        },
      },
    },
  });
}

