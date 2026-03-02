import { z } from "zod";
import { ok, fail } from "@/lib/api-response";
import { handleApiError } from "@/lib/errors";
import { runMarketSyncCronCycle } from "@/lib/services/marketSyncQueue";
import { normalizeTimeframe } from "@/lib/timeframe";
import type { MarketSyncSource } from "@/lib/services/marketSync";

const bodySchema = z.object({
  timeframe: z.string().optional(),
  days: z.coerce.number().int().min(1).max(2000).optional(),
  source: z.enum(["auto", "real", "mock"]).optional(),
  enqueueOnly: z.coerce.boolean().optional(),
  processOnly: z.coerce.boolean().optional(),
  limit: z.coerce.number().int().min(1).max(20).optional(),
});

function extractCronToken(request: Request, searchParams?: URLSearchParams) {
  const headerToken = request.headers.get("x-cron-token");
  if (headerToken) {
    return headerToken;
  }

  const authHeader = request.headers.get("authorization");
  if (authHeader?.startsWith("Bearer ")) {
    return authHeader.slice("Bearer ".length).trim();
  }

  return searchParams?.get("token") ?? null;
}

function authorizeCron(request: Request, searchParams?: URLSearchParams) {
  const expected = process.env.MARKET_SYNC_CRON_TOKEN;
  if (!expected) {
    return true;
  }

  const actual = extractCronToken(request, searchParams);
  return actual === expected;
}

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    if (!authorizeCron(request, url.searchParams)) {
      return fail("UNAUTHORIZED", "Invalid cron token", 401);
    }

    const payload = await runMarketSyncCronCycle();
    return ok(payload);
  } catch (error) {
    return handleApiError(error, "api-cron-market-sync-get");
  }
}

export async function POST(request: Request) {
  try {
    if (!authorizeCron(request)) {
      return fail("UNAUTHORIZED", "Invalid cron token", 401);
    }

    const json = await request.json().catch(() => ({}));
    const parsed = bodySchema.safeParse(json);
    if (!parsed.success) {
      return fail("INVALID_BODY", "Invalid cron payload", 400, parsed.error.flatten());
    }

    const payload = await runMarketSyncCronCycle({
      timeframe: normalizeTimeframe(parsed.data.timeframe),
      days: parsed.data.days,
      source: (parsed.data.source ?? "auto") as MarketSyncSource,
      enqueueOnly: parsed.data.enqueueOnly,
      processOnly: parsed.data.processOnly,
      limit: parsed.data.limit,
    });

    return ok(payload);
  } catch (error) {
    return handleApiError(error, "api-cron-market-sync-post");
  }
}

