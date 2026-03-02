import { fail } from "@/lib/api-response";

export class AppError extends Error {
  constructor(
    public readonly code: string,
    public readonly status: number,
    message: string,
    public readonly details?: unknown,
  ) {
    super(message);
    this.name = "AppError";
  }
}

export function handleApiError(error: unknown, scope: string) {
  if (error instanceof AppError) {
    console.error(`[${scope}]`, error.message, error.details);
    return fail(error.code, error.message, error.status, error.details);
  }

  console.error(`[${scope}] unexpected error`, error);
  return fail("INTERNAL_ERROR", "Internal server error", 500);
}

