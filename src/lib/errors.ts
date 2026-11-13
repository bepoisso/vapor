import type { ErrorKind } from "./bindings";

/** Message of a rejected command (`CommandError`), a thrown `Error` or a plain string. */
export function errorMessage(error: unknown): string {
  if (typeof error === "string") return error;
  if (error && typeof error === "object" && "message" in error) return String(error.message);
  return "Unknown error";
}

/** Kind of a rejected command (`CommandError.kind`); `other` for anything else. */
export function errorKind(error: unknown): ErrorKind {
  if (error && typeof error === "object" && "kind" in error) {
    const kind = error.kind;
    if (kind === "steamNotFound" || kind === "invalidApiKey" || kind === "network") return kind;
  }
  return "other";
}
