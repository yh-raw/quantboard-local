import { z } from "zod";
import { ok, fail } from "@/lib/api-response";
import { handleApiError } from "@/lib/errors";
import { requireUserId } from "@/lib/auth/user";
import {
  createAlertSubscription,
  deleteAlertSubscription,
  listAlertSubscriptions,
  listRecentAlertDeliveries,
  updateAlertSubscriptionActive,
} from "@/lib/repo/alertRepo";
import { normalizeTicker } from "@/lib/ticker";

const createSchema = z.object({
  ticker: z.string().min(1),
  channel: z.enum(["WEBHOOK", "TELEGRAM", "LOG"]),
  target: z.string().trim().max(500).optional().nullable(),
  signalType: z.enum(["MA_CROSS_UP", "MA_CROSS_DOWN", "BOLL_BREAK_UP", "BOLL_BREAK_DOWN"]).optional().nullable(),
});

const patchSchema = z.object({
  id: z.string().min(1),
  isActive: z.boolean(),
});

export async function GET() {
  try {
    const userId = await requireUserId();
    const [subscriptions, deliveries] = await Promise.all([
      listAlertSubscriptions(userId),
      listRecentAlertDeliveries(userId, 20),
    ]);

    return ok({
      subscriptions: subscriptions.map((item) => ({
        id: item.id,
        ticker: item.ticker,
        channel: item.channel,
        target: item.target,
        signalType: item.signalType,
        isActive: item.isActive,
        createdAt: item.createdAt.toISOString(),
        updatedAt: item.updatedAt.toISOString(),
        latestDelivery: item.deliveries[0]
          ? {
              id: item.deliveries[0].id,
              status: item.deliveries[0].status,
              signalType: item.deliveries[0].signalType,
              signalTs: item.deliveries[0].signalTs.toISOString(),
              sentAt: item.deliveries[0].sentAt.toISOString(),
              message: item.deliveries[0].message,
            }
          : null,
      })),
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
    });
  } catch (error) {
    return handleApiError(error, "api-alert-subscriptions-get");
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}));
    const parsed = createSchema.safeParse(body);

    if (!parsed.success) {
      return fail("INVALID_BODY", "Invalid alert subscription payload", 400, parsed.error.flatten());
    }

    const userId = await requireUserId();
    const ticker = normalizeTicker(parsed.data.ticker);
    const created = await createAlertSubscription({
      userId,
      ticker,
      channel: parsed.data.channel,
      target: parsed.data.target ?? null,
      signalType: parsed.data.signalType ?? null,
    });

    return ok({
      item: {
        id: created.id,
        ticker: created.ticker,
        channel: created.channel,
        target: created.target,
        signalType: created.signalType,
        isActive: created.isActive,
        createdAt: created.createdAt.toISOString(),
      },
    });
  } catch (error) {
    return handleApiError(error, "api-alert-subscriptions-post");
  }
}

export async function PATCH(request: Request) {
  try {
    const body = await request.json().catch(() => ({}));
    const parsed = patchSchema.safeParse(body);

    if (!parsed.success) {
      return fail("INVALID_BODY", "Invalid patch payload", 400, parsed.error.flatten());
    }

    const userId = await requireUserId();
    const updated = await updateAlertSubscriptionActive({
      userId,
      id: parsed.data.id,
      isActive: parsed.data.isActive,
    });

    return ok({ updated: updated.count });
  } catch (error) {
    return handleApiError(error, "api-alert-subscriptions-patch");
  }
}

export async function DELETE(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get("id");

    if (!id) {
      return fail("INVALID_QUERY", "id query param is required", 400);
    }

    const userId = await requireUserId();
    const deleted = await deleteAlertSubscription({
      userId,
      id,
    });

    return ok({ deleted: deleted.count });
  } catch (error) {
    return handleApiError(error, "api-alert-subscriptions-delete");
  }
}

