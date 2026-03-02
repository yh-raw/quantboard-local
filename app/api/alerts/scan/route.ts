import { z } from "zod";
import { ok, fail } from "@/lib/api-response";
import { requireUserId } from "@/lib/auth/user";
import { handleApiError } from "@/lib/errors";
import { runAlertScan } from "@/lib/services/alertScanService";

const bodySchema = z.object({
  forceSync: z.boolean().default(true),
  source: z.enum(["auto", "real", "mock"]).default("auto"),
});

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}));
    const parsed = bodySchema.safeParse(body);

    if (!parsed.success) {
      return fail("INVALID_BODY", "Invalid alert scan payload", 400, parsed.error.flatten());
    }

    const userId = await requireUserId();
    const result = await runAlertScan({
      userId,
      forceSync: parsed.data.forceSync,
      source: parsed.data.source,
    });

    return ok(result);
  } catch (error) {
    return handleApiError(error, "api-alert-scan-post");
  }
}

