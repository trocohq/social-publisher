import assert from "node:assert/strict";
import { mkdtemp, readFile, stat } from "node:fs/promises";
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
import {
  preparePublishedThumbnail,
  requirePublishedBackfillChannel,
} from "../src/backfill/prepare.js";
import { campaignStateSchema } from "../src/state/schema.js";
import { canonicalBrandRoot } from "./support/brand-root.js";
import { campaignStateFixture } from "./support/state-fixture.js";

const campaignId = "2026-08-27-quick-calculation-v1-0";
const thumbnail = {
  hash: "a".repeat(64),
  width: 1080 as const,
  height: 1920 as const,
  format: "jpeg" as const,
};

function historicalPublishedState() {
  const state = campaignStateFixture({
    instagram: "published",
    facebook: "published",
    tiktok: "skipped_disabled",
    youtube: "published",
  });
  return campaignStateSchema.parse({
    ...state,
    channels: Object.fromEntries(
      Object.entries(state.channels).map(([channel, record]) => [
        channel,
        record.stage === "published"
          ? { ...record, providerId: `buffer_${channel}` }
          : record,
      ]),
    ),
  });
}

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

test("only an exact published campaign and channel are eligible", () => {
  const state = historicalPublishedState();
  assert.equal(
    requirePublishedBackfillChannel(state, state.plan.id, "instagram")
      .providerId,
    state.channels.instagram.providerId,
  );
  assert.throws(
    () =>
      requirePublishedBackfillChannel(
        state,
        `${state.plan.id}-wrong`,
        "instagram",
      ),
    /does not match/i,
  );
  const missingProvider = campaignStateSchema.parse({
    ...state,
    channels: {
      ...state.channels,
      youtube: { ...state.channels.youtube, providerId: undefined },
    },
  });
  assert.throws(
    () =>
      requirePublishedBackfillChannel(
        missingProvider,
        missingProvider.plan.id,
        "youtube",
      ),
    /published provider ID/i,
  );
});

test("historical preparation writes a provider-ready cover and no durable state", async () => {
  const root = await mkdtemp(join(tmpdir(), "troco-thumbnail-prepare-"));
  const publishedState = historicalPublishedState();
  const before = JSON.stringify(publishedState);

  const prepared = await preparePublishedThumbnail({
    state: publishedState,
    campaignId: publishedState.plan.id,
    brandRoot: canonicalBrandRoot(),
    outputRoot: root,
  });

  assert.equal(JSON.stringify(publishedState), before);
  assert.deepEqual(
    [
      prepared.thumbnail.width,
      prepared.thumbnail.height,
      prepared.thumbnail.format,
    ],
    [1080, 1920, "jpeg"],
  );
  assert.ok((await stat(prepared.thumbnail.file)).size <= 2_000_000);
  assert.match(
    await readFile(prepared.reviewHtml, "utf8"),
    /ALTERE SOMENTE A CAPA/u,
  );
  assert.match(
    await readFile(prepared.reviewJson, "utf8"),
    /buffer_instagram/u,
  );
  assert.equal(
    await readThumbnailBackfill(root, publishedState.plan.id),
    undefined,
  );
});
