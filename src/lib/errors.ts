/** Message of a rejected command (`CommandError`), a thrown `Error` or a plain string. */
export function errorMessage(error: unknown): string {
  if (typeof error === "string") return error;
  if (error && typeof error === "object" && "message" in error) return String(error.message);
  return "Unknown error";
}
