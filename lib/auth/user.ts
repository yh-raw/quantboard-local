import { AppError } from "@/lib/errors";
import { getServerAuthSession } from "@/lib/auth/session";

export async function getCurrentUserId() {
  const session = await getServerAuthSession();
  return session?.user?.id ?? null;
}

export async function requireUserId() {
  const userId = await getCurrentUserId();
  if (!userId) {
    throw new AppError("UNAUTHORIZED", 401, "Authentication required");
  }
  return userId;
}
