import { normalizeCopy } from "../../shared/determinism.js";
import type { NormalizedProviderObject, ProviderResult } from "../types.js";
import { listBufferPosts } from "./list-posts.js";
import type { ListedBufferPost } from "./posts.js";

export type BufferPostFingerprint = Readonly<{
  channelId: string;
  providerId?: string;
  dueAt?: string;
  attemptedAt?: readonly string[];
  text: string;
  mediaUrls: readonly string[];
}>;

function sameDueAt(left: string | undefined, right: string): boolean {
  if (!left) return false;
  const leftTime = new Date(left).valueOf();
  const rightTime = new Date(right).valueOf();
  return Number.isFinite(leftTime) && leftTime === rightTime;
}

function closeToAttempt(
  dueAt: string | undefined,
  attempts: readonly string[],
): boolean {
  if (!dueAt) return true;
  const actual = new Date(dueAt).valueOf();
  return (
    Number.isFinite(actual) &&
    attempts.some((attempt) => {
      const expected = new Date(attempt).valueOf();
      return (
        Number.isFinite(expected) && Math.abs(actual - expected) <= 30 * 60_000
      );
    })
  );
}

export function matchExistingBufferPost(
  expected: BufferPostFingerprint,
  posts: readonly ListedBufferPost[],
): ListedBufferPost | undefined {
  const matches = posts.filter((post) => {
    if (post.channelId !== expected.channelId) return false;
    if (expected.providerId) return post.id === expected.providerId;
    const urls = post.assets?.map((asset) => asset.source ?? "") ?? [];
    return (
      (expected.dueAt
        ? sameDueAt(post.dueAt, expected.dueAt)
        : expected.attemptedAt?.length
          ? closeToAttempt(post.dueAt, expected.attemptedAt)
          : false) &&
      normalizeCopy(post.text ?? "") === normalizeCopy(expected.text) &&
      urls.length === expected.mediaUrls.length &&
      urls.every((url, index) => url === expected.mediaUrls[index])
    );
  });
  if (matches.length > 1) {
    throw new Error("Permanent Buffer reconciliation ambiguity");
  }
  return matches[0];
}

export async function reconcileBufferPost({
  apiKey,
  organizationId,
  expected,
  fetchImplementation,
}: Readonly<{
  apiKey: string;
  organizationId: string;
  expected: BufferPostFingerprint;
  fetchImplementation?: typeof fetch;
}>): Promise<ProviderResult<NormalizedProviderObject | undefined>> {
  if (
    !expected.providerId &&
    !expected.dueAt &&
    !expected.attemptedAt?.length
  ) {
    return {
      kind: "permanent_error",
      category: "buffer_reconciliation_identity",
      message: "Buffer reconciliation identity is incomplete",
    };
  }
  const dueAt =
    !expected.providerId && expected.dueAt
      ? new Date(expected.dueAt)
      : undefined;
  const range = dueAt
    ? {
        start: new Date(dueAt.valueOf() - 10 * 60_000).toISOString(),
        end: new Date(dueAt.valueOf() + 10 * 60_000).toISOString(),
      }
    : undefined;
  const response = await listBufferPosts({
    apiKey,
    organizationId,
    channelIds: [expected.channelId],
    statuses: ["scheduled", "sending", "sent", "error"],
    ...(range ? { dueAt: range } : {}),
    sortDirection: range ? "asc" : "desc",
    ...(fetchImplementation ? { fetchImplementation } : {}),
  });
  if (response.kind !== "success") return response;
  const match = matchExistingBufferPost(expected, response.value);
  if (match?.status === "error") {
    return {
      kind: "permanent_error",
      category: "buffer_async_failure",
      message: "Buffer reported an asynchronous delivery failure",
    };
  }
  return {
    kind: "success",
    value: match
      ? {
          id: match.id,
          status:
            match.status === "sent"
              ? "published"
              : match.status === "sending"
                ? "publishing"
                : "scheduled",
          ...(match.dueAt ? { dueAt: match.dueAt } : {}),
        }
      : undefined,
  };
}
