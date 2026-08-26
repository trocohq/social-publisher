import { sanitizedErrorSchema, type SanitizedError } from "./schema.js";

const sensitiveKey = /authorization|token|secret|password|cookie|api[-_]?key/i;
const sensitiveValue =
  /\bBearer\s+\S+|https:\/\/[^\s]*googleapis\.com\/upload\/|[?&](?:access_token|refresh_token|api[-_]?key|token)=/i;

function containsSensitive(
  value: unknown,
  seen: WeakSet<object> = new WeakSet(),
): boolean {
  if (typeof value === "string") {
    return value.length > 500 || sensitiveValue.test(value);
  }
  if (!value || typeof value !== "object") return false;
  if (seen.has(value)) return true;
  seen.add(value);
  for (const [key, nested] of Object.entries(value)) {
    if (sensitiveKey.test(key) || containsSensitive(nested, seen)) return true;
  }
  return false;
}

function objectValue(value: unknown, key: string): unknown {
  return value && typeof value === "object"
    ? (value as Record<string, unknown>)[key]
    : undefined;
}

export function sanitizeError(value: unknown): SanitizedError {
  if (containsSensitive(value)) {
    return {
      category: "redacted_provider_error",
      message: "Provider error contained sensitive data",
    };
  }

  const rawMessage =
    value instanceof Error ? value.message : objectValue(value, "message");
  const rawCategory = objectValue(value, "category");
  const rawStatus =
    objectValue(value, "statusCode") ?? objectValue(value, "status");
  const rawRetry = objectValue(value, "retryAfterSeconds");
  const category =
    typeof rawCategory === "string" && /^[a-z0-9_]+$/.test(rawCategory)
      ? rawCategory.slice(0, 80)
      : "provider_error";
  const message =
    typeof rawMessage === "string" && rawMessage.trim()
      ? rawMessage.trim().replace(/\s+/g, " ").slice(0, 500)
      : "Provider request failed";
  const statusCode = Number(rawStatus);
  const retryAfterSeconds = Number(rawRetry);

  return sanitizedErrorSchema.parse({
    category,
    message,
    ...(Number.isInteger(statusCode) && statusCode >= 100 && statusCode <= 599
      ? { statusCode }
      : {}),
    ...(Number.isInteger(retryAfterSeconds) &&
    retryAfterSeconds >= 0 &&
    retryAfterSeconds <= 86_400
      ? { retryAfterSeconds }
      : {}),
  });
}
