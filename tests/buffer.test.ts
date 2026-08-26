import assert from "node:assert/strict";
import test from "node:test";

import {
  createBufferPostInput,
  normalizeBufferCreateResponse,
} from "../src/networks/buffer/posts.js";
import { matchExistingBufferPost } from "../src/networks/buffer/reconcile.js";

test("Buffer uses custom scheduling and ordered public image assets", () => {
  const input = createBufferPostInput({
    channel: "instagram",
    channelId: "ig_1",
    text: "Legenda",
    dueAt: "2026-08-26T15:17:00.000Z",
    mediaKind: "carousel",
    mediaUrls: [
      "https://trocohq.github.io/social-publisher/media/a.jpg",
      "https://trocohq.github.io/social-publisher/media/b.jpg",
    ],
  });
  assert.deepEqual(input.assets, [
    {
      image: {
        url: "https://trocohq.github.io/social-publisher/media/a.jpg",
      },
    },
    {
      image: {
        url: "https://trocohq.github.io/social-publisher/media/b.jpg",
      },
    },
  ]);
  assert.equal(input.mode, "customScheduled");
  assert.equal(input.metadata.instagram?.type, "post");
});

test("Buffer typed mutation errors become sanitized retry classes", () => {
  assert.deepEqual(
    normalizeBufferCreateResponse({
      data: { createPost: { message: "Rate limit exceeded" } },
    }),
    {
      kind: "retryable_error",
      category: "buffer_rate_limit",
      message: "Buffer temporarily rejected the post",
    },
  );
});

test("reconciliation matches channel, due time, normalized copy, and media", () => {
  const match = matchExistingBufferPost(
    {
      channelId: "ig_1",
      dueAt: "2026-08-26T15:17:00.000Z",
      text: "Troco certo",
      mediaUrls: ["https://example.test/slide.jpg"],
    },
    [
      {
        id: "post_1",
        channelId: "ig_1",
        dueAt: "2026-08-26T15:17:00.000Z",
        text: " Troco  certo ",
        status: "scheduled",
        assets: [{ source: "https://example.test/slide.jpg" }],
      },
    ],
  );
  assert.equal(match?.id, "post_1");
});
