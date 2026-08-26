export type NormalizedProviderStatus = "scheduled" | "publishing" | "published";

export type NormalizedProviderObject = Readonly<{
  id: string;
  dueAt?: string;
  status: NormalizedProviderStatus;
  permalink?: string;
}>;

export type ProviderErrorResult = Readonly<{
  kind: "retryable_error" | "permanent_error";
  category: string;
  message: string;
  statusCode?: number;
  retryAfterSeconds?: number;
}>;

export type ProviderResult<T> =
  Readonly<{ kind: "success"; value: T }> | ProviderErrorResult;
