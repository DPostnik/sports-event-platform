export function databaseFailure(error: unknown): "OVERLOADED" | "UNAVAILABLE" | undefined {
  if (!(error instanceof Error)) return undefined;
  if (error instanceof AggregateError) {
    const causes: readonly unknown[] = error.errors;
    return causes.length > 0 && causes.every((cause) => databaseFailure(cause) === "UNAVAILABLE")
      ? "UNAVAILABLE" : undefined;
  }
  // pg-pool gives its checkout timeout no error code.
  if (error.message === "timeout exceeded when trying to connect") return "OVERLOADED";
  if (error.message === "Connection terminated due to connection timeout" ||
      error.message === "Connection terminated unexpectedly") return "UNAVAILABLE";
  if (!("code" in error) || typeof error.code !== "string") return undefined;
  if (/^08[A-Z0-9]{3}$/.test(error.code) || [
    "57014", "57P01", "57P02", "57P03",
    "ECONNREFUSED", "ECONNRESET", "ETIMEDOUT", "EHOSTUNREACH", "ENETUNREACH", "EAI_AGAIN", "ENOTFOUND",
  ].includes(error.code)) return "UNAVAILABLE";
  return undefined;
}
