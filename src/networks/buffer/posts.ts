import type { NormalizedProviderObject, ProviderResult } from "../types.js";
import { bufferGraphql } from "./graphql.js";

export type BufferChannel = "instagram" | "facebook" | "tiktok";
export type BufferMediaKind = "feed" | "carousel" | "video";

type BufferAsset =
  | Readonly<{ image: Readonly<{ url: string }> }>
  | Readonly<{
      video: Readonly<{
        url: string;
        metadata: Readonly<{ thumbnailOffset: 2000 }>;
      }>;
    }>;

type BufferPostBase = Readonly<{
  channelId: string;
  text: string;
  schedulingType: "automatic";
  needsApproval: false;
  aiAssisted: false;
  assets: readonly BufferAsset[];
  metadata: Readonly<{
    instagram?: Readonly<{
      type: "post" | "reel";
      shouldShareToFeed: true;
      isAiGenerated: false;
    }>;
    tiktok?: Readonly<{ title?: string; isAiGenerated: false }>;
  }>;
}>;

export type BufferPostInput = BufferPostBase &
  (
    | Readonly<{
        mode: "customScheduled";
        dueAt: string;
      }>
    | Readonly<{ mode: "shareNow" }>
  );

function requirePublicHttpsUrl(value: string): string {
  const url = new URL(value);
  if (url.protocol !== "https:" || url.username || url.password) {
    throw new Error("Buffer media assets require public HTTPS URLs");
  }
  return url.toString();
}

export function createBufferPostInput({
  channel,
  channelId,
  text,
  dueAt,
  phase,
  mediaKind,
  mediaUrls,
  title,
}: Readonly<{
  channel: BufferChannel;
  channelId: string;
  text: string;
  dueAt: string;
  phase: "scheduling" | "publishing";
  mediaKind: BufferMediaKind;
  mediaUrls: readonly string[];
  title?: string;
}>): BufferPostInput {
  if (!channelId || !text.trim()) throw new Error("Buffer post is incomplete");
  const parsedDueAt = new Date(dueAt);
  if (Number.isNaN(parsedDueAt.valueOf()) || !dueAt.endsWith("Z")) {
    throw new Error("Buffer dueAt must be a UTC date-time");
  }
  if (mediaKind === "video" && mediaUrls.length !== 1) {
    throw new Error("Buffer video posts require exactly one video");
  }
  if (
    mediaKind === "carousel" &&
    (mediaUrls.length < 2 || mediaUrls.length > 5)
  ) {
    throw new Error("Buffer carousels require two to five images");
  }
  if (mediaKind === "feed" && mediaUrls.length !== 1) {
    throw new Error("Buffer feed posts require one image");
  }
  const urls = mediaUrls.map(requirePublicHttpsUrl);
  const assets: readonly BufferAsset[] =
    mediaKind === "video"
      ? [
          {
            video: {
              url: urls[0]!,
              metadata: { thumbnailOffset: 2000 },
            },
          },
        ]
      : urls.map((url) => ({ image: { url } }));
  const metadata: BufferPostInput["metadata"] =
    channel === "instagram"
      ? {
          instagram: {
            type: mediaKind === "video" ? "reel" : "post",
            shouldShareToFeed: true,
            isAiGenerated: false,
          },
        }
      : channel === "tiktok"
        ? {
            tiktok: {
              ...(mediaKind !== "video" && title ? { title } : {}),
              isAiGenerated: false,
            },
          }
        : {};

  return Object.freeze({
    channelId,
    text,
    schedulingType: "automatic",
    ...(phase === "scheduling"
      ? {
          mode: "customScheduled" as const,
          dueAt: parsedDueAt.toISOString(),
        }
      : { mode: "shareNow" as const }),
    needsApproval: false,
    aiAssisted: false,
    assets: Object.freeze(assets),
    metadata: Object.freeze(metadata),
  });
}

type BufferPost = Readonly<{
  id: string;
  text?: string;
  status?: string;
  dueAt?: string;
  channelId?: string;
  permalink?: string;
  assets?: readonly { source?: string; mimeType?: string }[];
}>;

export const CREATE_BUFFER_POST_MUTATION = `mutation CreateTrocoPost($input: CreatePostInput!) {
  createPost(input: $input) {
    ... on PostActionSuccess {
      post { id text status dueAt channelId assets { source mimeType } }
    }
    ... on MutationError { message }
  }
}`;

export function normalizeBufferCreateResponse(
  input: unknown,
): ProviderResult<NormalizedProviderObject> {
  const payload = input as {
    data?: { createPost?: { message?: string; post?: BufferPost } };
  };
  const result = payload.data?.createPost;
  if (result?.post?.id) {
    const status = result.post.status === "sent" ? "published" : "scheduled";
    return {
      kind: "success",
      value: {
        id: result.post.id,
        status,
        ...(result.post.dueAt ? { dueAt: result.post.dueAt } : {}),
        ...(result.post.permalink ? { permalink: result.post.permalink } : {}),
      },
    };
  }
  const message = result?.message?.toLowerCase() ?? "";
  if (/rate|limit/.test(message)) {
    return {
      kind: "retryable_error",
      category: "buffer_rate_limit",
      message: "Buffer temporarily rejected the post",
    };
  }
  if (/auth|permission/.test(message)) {
    return {
      kind: "permanent_error",
      category: "buffer_auth",
      message: "Buffer authorization failed",
    };
  }
  if (/unsupported|channel|capability/.test(message)) {
    return {
      kind: "permanent_error",
      category: "buffer_capability",
      message: "Buffer channel cannot accept this post",
    };
  }
  return {
    kind: "permanent_error",
    category: "buffer_validation",
    message: "Buffer rejected the post",
  };
}

export async function createBufferPost({
  apiKey,
  input,
  fetchImplementation,
}: Readonly<{
  apiKey: string;
  input: BufferPostInput;
  fetchImplementation?: typeof fetch;
}>): Promise<ProviderResult<NormalizedProviderObject>> {
  const response = await bufferGraphql<{
    createPost: { message?: string; post?: BufferPost };
  }>({
    apiKey,
    query: CREATE_BUFFER_POST_MUTATION,
    variables: { input },
    ...(fetchImplementation ? { fetchImplementation } : {}),
  });
  if (response.kind !== "success") return response;
  return normalizeBufferCreateResponse({ data: response.value });
}

export type ListedBufferPost = BufferPost & Readonly<{ id: string }>;
