type FeedEvidence = Readonly<{
  state: "scheduled" | "processing" | "published";
  assetHashes: readonly string[];
  publishedAt?: string;
}>;
type StoryCapability = Readonly<{
  supported: boolean;
  sameFeedArtifactsSupported: boolean;
  maxImages: number;
  validUntil: string;
}>;

export function planStaticStory(
  input: Readonly<{
    now: string;
    publishAt: string;
    approvedAssetHashes: readonly string[];
    feed: FeedEvidence;
    capability: StoryCapability;
  }>,
): Readonly<
  | { kind: "ready"; assetHashes: readonly string[]; requestedSlots: 1 }
  | { kind: "held"; reason: string }
> {
  const now = Date.parse(input.now);
  const due = Date.parse(input.publishAt);
  if (!Number.isFinite(now) || !Number.isFinite(due) || due <= now)
    return { kind: "held", reason: "STATIC_STORY_TIME_INVALID" };
  if (input.feed.state !== "published")
    return { kind: "held", reason: "STATIC_STORY_FEED_NOT_PUBLISHED" };
  if (
    !input.capability.supported ||
    Date.parse(input.capability.validUntil) < now
  )
    return { kind: "held", reason: "STATIC_STORY_UNSUPPORTED" };
  if (!input.capability.sameFeedArtifactsSupported)
    return { kind: "held", reason: "STATIC_STORY_REUSE_UNSUPPORTED" };
  if (
    input.approvedAssetHashes.length !== 1 ||
    input.capability.maxImages < input.approvedAssetHashes.length
  )
    return { kind: "held", reason: "STATIC_STORY_CAROUSEL_UNSUPPORTED" };
  if (!arraysEqual(input.approvedAssetHashes, input.feed.assetHashes))
    return { kind: "held", reason: "STATIC_STORY_MEDIA_MISMATCH" };
  return {
    kind: "ready",
    assetHashes: [...input.approvedAssetHashes],
    requestedSlots: 1,
  };
}

function arraysEqual(
  left: readonly string[],
  right: readonly string[],
): boolean {
  return (
    left.length === right.length &&
    left.every((value, index) => value === right[index])
  );
}
