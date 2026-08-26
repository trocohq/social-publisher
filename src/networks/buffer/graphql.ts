import type { ProviderErrorResult, ProviderResult } from "../types.js";

export const BUFFER_GRAPHQL_ORIGIN = "https://api.buffer.com";

function classifiedError(
  statusCode: number,
  source: "http" | "graphql",
  message = "",
  retryAfterSeconds?: number,
): ProviderErrorResult {
  const lower = message.toLowerCase();
  const retryable = statusCode === 429 || statusCode >= 500;
  const category =
    statusCode === 401 || statusCode === 403 || /auth|permission/.test(lower)
      ? "buffer_auth"
      : statusCode === 429 || /rate|limit/.test(lower)
        ? "buffer_rate_limit"
        : /unsupported|capability|channel/.test(lower)
          ? "buffer_capability"
          : retryable
            ? "buffer_server"
            : source === "graphql"
              ? "buffer_graphql"
              : "buffer_validation";
  return {
    kind: retryable ? "retryable_error" : "permanent_error",
    category,
    message: retryable
      ? "Buffer request failed temporarily"
      : "Buffer rejected the request",
    statusCode,
    ...(retryAfterSeconds !== undefined ? { retryAfterSeconds } : {}),
  };
}

function retryAfter(response: Response): number | undefined {
  const value = Number(response.headers.get("retry-after"));
  return Number.isInteger(value) && value >= 0 ? value : undefined;
}

export async function bufferGraphql<T>({
  apiKey,
  query,
  variables,
  fetchImplementation = fetch,
}: Readonly<{
  apiKey: string;
  query: string;
  variables: Readonly<Record<string, unknown>>;
  fetchImplementation?: typeof fetch;
}>): Promise<ProviderResult<T>> {
  if (!apiKey) {
    return {
      kind: "permanent_error",
      category: "buffer_auth",
      message: "Buffer API key is missing",
    };
  }
  if (!query.trim() || /\$\{/.test(query)) {
    return {
      kind: "permanent_error",
      category: "buffer_graphql",
      message: "Buffer GraphQL document is invalid",
    };
  }

  try {
    const response = await fetchImplementation(BUFFER_GRAPHQL_ORIGIN, {
      method: "POST",
      headers: {
        authorization: `Bearer ${apiKey}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({ query, variables }),
      redirect: "error",
      signal: AbortSignal.timeout(20_000),
    });
    if (!response.ok) {
      return classifiedError(response.status, "http", "", retryAfter(response));
    }
    const payload = (await response.json()) as {
      data?: T;
      errors?: readonly { message?: string }[];
    };
    if (payload.errors?.length) {
      return classifiedError(
        400,
        "graphql",
        payload.errors.map((error) => error.message ?? "").join(" "),
      );
    }
    if (!payload.data) {
      return {
        kind: "retryable_error",
        category: "buffer_malformed_response",
        message: "Buffer returned an incomplete response",
      };
    }
    return { kind: "success", value: payload.data };
  } catch {
    return {
      kind: "retryable_error",
      category: "buffer_network",
      message: "Buffer could not be reached",
    };
  }
}
