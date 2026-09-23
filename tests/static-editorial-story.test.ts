import assert from "node:assert/strict";
import test from "node:test";
import { planStaticStory } from "../src/static-editorial/story.js";

const feed = {
  state: "published" as const,
  assetHashes: ["sha256:aaa"],
  publishedAt: "2026-09-16T17:00:00.000Z",
};
const capability = {
  supported: true,
  sameFeedArtifactsSupported: true,
  maxImages: 1,
  validUntil: "2026-09-17T00:00:00.000Z",
};

test("reuses exact approved feed bytes in the same order", () => {
  assert.deepEqual(
    planStaticStory({
      now: "2026-09-16T18:00:00.000Z",
      publishAt: "2026-09-16T20:00:00.000Z",
      approvedAssetHashes: ["sha256:aaa"],
      feed,
      capability,
    }),
    { kind: "ready", assetHashes: ["sha256:aaa"], requestedSlots: 1 },
  );
});

test("holds instead of cropping or substituting media", () => {
  const cases = [
    [
      { ...feed, state: "scheduled" as const },
      capability,
      ["sha256:aaa"],
      "STATIC_STORY_FEED_NOT_PUBLISHED",
    ],
    [
      feed,
      { ...capability, supported: false },
      ["sha256:aaa"],
      "STATIC_STORY_UNSUPPORTED",
    ],
    [
      feed,
      { ...capability, sameFeedArtifactsSupported: false },
      ["sha256:aaa"],
      "STATIC_STORY_REUSE_UNSUPPORTED",
    ],
    [
      feed,
      capability,
      ["sha256:aaa", "sha256:bbb"],
      "STATIC_STORY_CAROUSEL_UNSUPPORTED",
    ],
    [feed, capability, ["sha256:bbb"], "STATIC_STORY_MEDIA_MISMATCH"],
  ] as const;
  for (const [currentFeed, currentCapability, hashes, reason] of cases)
    assert.deepEqual(
      planStaticStory({
        now: "2026-09-16T18:00:00.000Z",
        publishAt: "2026-09-16T20:00:00.000Z",
        approvedAssetHashes: hashes,
        feed: currentFeed,
        capability: currentCapability,
      }),
      { kind: "held", reason },
    );
});
