import assert from "node:assert/strict";
import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import {
  assertMatchingThumbnail,
  createThumbnailBackfillAudit,
  recordThumbnailBackfillOutcome,
} from "../src/backfill/schema.js";
import {
  readThumbnailBackfill,
  writeThumbnailBackfill,
} from "../src/backfill/storage.js";

const campaignId = "2026-08-27-quick-calculation-v1-0";
const thumbnail = {
  hash: "a".repeat(64),
  width: 1080 as const,
  height: 1920 as const,
  format: "jpeg" as const,
};

test("thumbnail backfill audit is atomic and channel independent", async () => {
  const root = await mkdtemp(join(tmpdir(), "troco-thumbnail-backfill-"));
  const initial = createThumbnailBackfillAudit({
    campaignId,
    thumbnail,
    bufferProviderIds: {
      instagram: "buffer_ig",
      facebook: "buffer_fb",
      youtube: "buffer_yt",
    },
  });
  const updated = recordThumbnailBackfillOutcome({
    audit: initial,
    channel: "youtube",
    outcome: {
      status: "updated",
      nativeProviderId: "youtube_1",
      permalink: "https://www.youtube.com/watch?v=youtube_1",
    },
    now: new Date("2026-08-28T18:00:00Z"),
  });

  await writeThumbnailBackfill(root, updated);

  assert.deepEqual(await readThumbnailBackfill(root, campaignId), updated);
  assert.equal(updated.channels.youtube.attempts, 1);
  assert.equal(updated.channels.youtube.status, "updated");
  assert.equal(updated.channels.instagram.status, "pending");
  const bytes = await readFile(
    join(root, "thumbnail-backfills", `${campaignId}.json`),
    "utf8",
  );
  assert.match(bytes, /"schemaVersion": 1/u);
  assert.doesNotMatch(bytes, /access.?token|authorization|secret/iu);
});

test("a successful audit rejects a different thumbnail", () => {
  const audit = createThumbnailBackfillAudit({
    campaignId,
    thumbnail,
    bufferProviderIds: {},
  });

  assert.throws(
    () =>
      assertMatchingThumbnail(audit, {
        ...thumbnail,
        hash: "b".repeat(64),
      }),
    /thumbnail hash changed/i,
  );
});

test("a successful retry clears the previous sanitized failure", () => {
  const initial = createThumbnailBackfillAudit({
    campaignId,
    thumbnail,
    bufferProviderIds: { facebook: "buffer_fb" },
  });
  const failed = recordThumbnailBackfillOutcome({
    audit: initial,
    channel: "facebook",
    outcome: {
      status: "failed",
      lastError: {
        category: "native_thumbnail_update",
        message: "Native cover update failed during controlled review",
      },
    },
    now: new Date("2026-08-28T18:00:00Z"),
  });

  const recovered = recordThumbnailBackfillOutcome({
    audit: failed,
    channel: "facebook",
    outcome: { status: "updated" },
    now: new Date("2026-08-28T18:05:00Z"),
  });

  assert.equal(recovered.channels.facebook.status, "updated");
  assert.equal(recovered.channels.facebook.attempts, 2);
  assert.equal(recovered.channels.facebook.lastError, undefined);
});

test("missing audit files return undefined", async () => {
  const root = await mkdtemp(join(tmpdir(), "troco-thumbnail-backfill-"));

  assert.equal(await readThumbnailBackfill(root, campaignId), undefined);
});
