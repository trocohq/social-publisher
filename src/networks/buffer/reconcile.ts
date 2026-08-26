import { normalizeCopy } from "../../shared/determinism.js";
import type { NormalizedProviderObject, ProviderResult } from "../types.js";
import { listBufferPosts } from "./list-posts.js";
import type { ListedBufferPost } from "./posts.js";

export type BufferPostFingerprint = Readonly<{
  channelId: string;
  dueAt: string;
  text: string;
  mediaUrls: readonly string[];
}>;

function sameDueAt(left: string | undefined, right: string): boolean {
  if (!left) return false;
  const leftTime = new Date(left).valueOf();
  const rightTime = new Date(right).valueOf();
  return Number.isFinite(leftTime) && leftTime === rightTime;
}

export function matchExistingBufferPost(
  expected: BufferPostFingerprint,
  posts: readonly ListedBufferPost[],
): ListedBufferPost | undefined {
  const matches = posts.filter((post) => {
    const urls = post.assets?.map((asset) => asset.source ?? "") ?? [];
    return (
      post.channelId === expected.channelId &&
      sameDueAt(post.dueAt, expected.dueAt) &&
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
  const dueAt = new Date(expected.dueAt);
  const from = new Date(dueAt.valueOf() - 10 * 60_000).toISOString();
  const to = new Date(dueAt.valueOf() + 10 * 60_000).toISOString();
  const response = await listBufferPosts({
    apiKey,
    organizationId,
    channelIds: [expected.channelId],
    statuses: ["scheduled", "sent"],
    dueAt: { start: from, end: to },
    ...(fetchImplementation ? { fetchImplementation } : {}),
  });
  if (response.kind !== "success") return response;
  const match = matchExistingBufferPost(expected, response.value);
  return {
    kind: "success",
    value: match
      ? {
          id: match.id,
          status: match.status === "sent" ? "published" : "scheduled",
          ...(match.dueAt ? { dueAt: match.dueAt } : {}),
        }
      : undefined,
  };
}
