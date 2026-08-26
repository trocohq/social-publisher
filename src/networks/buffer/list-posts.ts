import type { ProviderResult } from "../types.js";
import { bufferGraphql } from "./graphql.js";
import type { ListedBufferPost } from "./posts.js";

type BufferPostsConnection = Readonly<{
  edges?: readonly Readonly<{ node?: ListedBufferPost }>[];
  pageInfo?: Readonly<{
    hasNextPage?: boolean;
    endCursor?: string | null;
  }>;
}>;

const LIST_POSTS_QUERY = `query TrocoPosts($first: Int!, $after: String, $input: PostsInput!) {
  posts(first: $first, after: $after, input: $input) {
    edges { node { id text status dueAt channelId assets { source mimeType } } }
    pageInfo { hasNextPage endCursor }
  }
}`;

export async function listBufferPosts({
  apiKey,
  organizationId,
  channelIds,
  statuses,
  dueAt,
  operationName = "TrocoPosts",
  fetchImplementation,
}: Readonly<{
  apiKey: string;
  organizationId: string;
  channelIds: readonly string[];
  statuses: readonly ("scheduled" | "sending" | "sent" | "error")[];
  dueAt?: Readonly<{ start: string; end: string }>;
  operationName?: "TrocoPosts" | "TrocoScheduledPosts";
  fetchImplementation?: typeof fetch;
}>): Promise<ProviderResult<readonly ListedBufferPost[]>> {
  const query = LIST_POSTS_QUERY.replaceAll("TrocoPosts", operationName);
  const posts: ListedBufferPost[] = [];
  let after: string | null = null;

  for (let page = 0; page < 20; page += 1) {
    const response: ProviderResult<{ posts: BufferPostsConnection }> =
      await bufferGraphql<{ posts: BufferPostsConnection }>({
        apiKey,
        query,
        variables: {
          first: 100,
          after,
          input: {
            organizationId,
            filter: {
              status: statuses,
              channelIds,
              ...(dueAt ? { dueAt } : {}),
            },
            sort: [{ field: "dueAt", direction: "asc" }],
          },
        },
        ...(fetchImplementation ? { fetchImplementation } : {}),
      });
    if (response.kind !== "success") return response;
    const connection: BufferPostsConnection = response.value.posts;
    if (!connection || !Array.isArray(connection.edges)) {
      return {
        kind: "retryable_error",
        category: "buffer_malformed_response",
        message: "Buffer returned an incomplete posts connection",
      };
    }
    for (const edge of connection.edges) {
      if (!edge.node?.id) {
        return {
          kind: "retryable_error",
          category: "buffer_malformed_response",
          message: "Buffer returned an incomplete post",
        };
      }
      posts.push(edge.node);
    }
    if (!connection.pageInfo?.hasNextPage) {
      return { kind: "success", value: Object.freeze(posts) };
    }
    const nextCursor: string | null | undefined = connection.pageInfo.endCursor;
    if (!nextCursor || nextCursor === after) {
      return {
        kind: "retryable_error",
        category: "buffer_malformed_response",
        message: "Buffer returned an invalid posts cursor",
      };
    }
    after = nextCursor;
  }

  return {
    kind: "retryable_error",
    category: "buffer_pagination_exhausted",
    message: "Buffer posts pagination exceeded its safe limit",
  };
}
