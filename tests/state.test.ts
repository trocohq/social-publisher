import assert from "node:assert/strict";
import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { markDisabledChannels } from "../src/state/channel-availability.js";
import {
  migrateControlledYouTubeToBuffer,
  recoverFixedProviderContract,
} from "../src/state/recovery.js";
import { sanitizeError } from "../src/state/sanitize.js";
import { campaignStateSchema } from "../src/state/schema.js";
import { writeCampaignState } from "../src/state/storage.js";
import { transitionProvider } from "../src/state/transitions.js";
import { campaignStateFixture } from "./support/state-fixture.js";

test("provider transitions reject illegal skips and retain sibling success", () => {
  const state = campaignStateFixture();
  assert.throws(
    () =>
      transitionProvider(
        state,
        "instagram",
        "published",
        new Date("2026-08-26T10:00:00Z"),
      ),
    /Illegal transition/,
  );
  const scheduled = transitionProvider(
    state,
    "instagram",
    "scheduling",
    new Date("2026-08-26T10:00:00Z"),
  );
  assert.equal(scheduled.channels.youtube.stage, state.channels.youtube.stage);
  assert.equal(scheduled.channels.instagram.stage, "scheduling");
});

test("tracked errors reject secret-bearing keys and values", () => {
  assert.deepEqual(
    sanitizeError({
      message: "Bearer abc123",
      response: { authorization: "secret" },
    }),
    {
      category: "redacted_provider_error",
      message: "Provider error contained sensitive data",
    },
  );
});

test("campaign state is atomically written as validated JSON", async () => {
  const root = await mkdtemp(join(tmpdir(), "troco-state-"));
  await writeCampaignState(root, campaignStateFixture());
  const saved = JSON.parse(
    await readFile(join(root, "campaigns/2026-08-26.json"), "utf8"),
  );
  const index = JSON.parse(await readFile(join(root, "index.json"), "utf8"));
  assert.equal(saved.schemaVersion, 1);
  assert.deepEqual(index.campaigns, ["2026-08-26"]);
});

test("new campaigns permanently skip disabled channels", () => {
  const now = new Date("2026-08-27T12:00:00Z");
  const state = campaignStateFixture({
    instagram: "planned",
    facebook: "planned",
    tiktok: "planned",
    youtube: "planned",
  });
  const configured = markDisabledChannels(
    state,
    {
      instagram: true,
      facebook: true,
      tiktok: false,
      youtube: true,
    },
    now,
  );

  assert.equal(configured.channels.instagram.stage, "planned");
  assert.equal(configured.channels.tiktok.stage, "skipped_disabled");
  assert.deepEqual(configured.channels.tiktok.transitions, [
    {
      from: "planned",
      to: "skipped_disabled",
      at: now.toISOString(),
    },
  ]);
  assert.throws(
    () => transitionProvider(configured, "tiktok", "rendered", now),
    /Illegal transition/,
  );
});

test("queued campaigns skip a disabled channel before provider intent", () => {
  const now = new Date("2026-08-27T13:00:00Z");
  const state = campaignStateFixture({
    instagram: "deploying",
    facebook: "deploying",
    tiktok: "skipped_disabled",
    youtube: "deploying",
  });
  const configured = markDisabledChannels(
    state,
    {
      instagram: true,
      facebook: true,
      tiktok: false,
      youtube: false,
    },
    now,
  );

  assert.equal(configured.channels.youtube.stage, "skipped_disabled");
  assert.deepEqual(configured.channels.youtube.transitions.at(-1), {
    from: "deploying",
    to: "skipped_disabled",
    at: now.toISOString(),
  });
  assert.equal(configured.channels.instagram.stage, "deploying");
  assert.equal(configured.channels.facebook.stage, "deploying");
  assert.equal(configured.channels.tiktok.stage, "skipped_disabled");
});

test("disabling a channel never rewrites an existing provider object", () => {
  const now = new Date("2026-08-27T13:00:00Z");
  const state = campaignStateFixture({ youtube: "scheduled" });
  const configured = markDisabledChannels(
    state,
    {
      instagram: true,
      facebook: true,
      tiktok: true,
      youtube: false,
    },
    now,
  );

  assert.deepEqual(configured.channels.youtube, state.channels.youtube);
});

test("a fixed Buffer contract can recover one failed channel without touching siblings", () => {
  const attemptedAt = new Date("2026-08-27T15:51:22Z");
  const recoveredAt = new Date("2026-08-27T16:00:00Z");
  let failed = transitionProvider(
    campaignStateFixture(),
    "facebook",
    "scheduling",
    attemptedAt,
  );
  failed = transitionProvider(failed, "facebook", "failed", attemptedAt);
  failed = campaignStateSchema.parse({
    ...failed,
    channels: {
      ...failed.channels,
      facebook: {
        ...failed.channels.facebook,
        lastError: {
          category: "buffer_validation",
          message: "Buffer rejected the post",
        },
      },
    },
  });

  const recovered = recoverFixedProviderContract(
    failed,
    "facebook",
    recoveredAt,
  );

  assert.equal(recovered.channels.facebook.stage, "retryable");
  assert.equal(recovered.channels.facebook.lastError, undefined);
  assert.equal(
    recovered.channels.instagram.stage,
    failed.channels.instagram.stage,
  );
  assert.deepEqual(recovered.channels.facebook.transitions.at(-1), {
    from: "failed",
    to: "retryable",
    at: recoveredAt.toISOString(),
  });
});

test("a future private YouTube verification can migrate to Buffer once", () => {
  const now = new Date("2026-08-25T12:00:00Z");
  let state = transitionProvider(
    campaignStateFixture({ youtube: "media_verified" }),
    "youtube",
    "scheduling",
    now,
  );
  state = transitionProvider(state, "youtube", "scheduled", now);
  state = campaignStateSchema.parse({
    ...state,
    channels: {
      ...state.channels,
      youtube: {
        ...state.channels.youtube,
        providerId: "private_video_1",
        permalink: "https://www.youtube.com/watch?v=private_video_1",
      },
    },
  });

  const migrated = migrateControlledYouTubeToBuffer(
    state,
    new Date("2026-08-25T13:00:00Z"),
  );

  assert.equal(migrated.channels.youtube.stage, "retryable");
  assert.equal(migrated.channels.youtube.providerId, undefined);
  assert.equal(migrated.channels.youtube.permalink, undefined);
  assert.deepEqual(migrated.channels.youtube.transitions.at(-1), {
    from: "scheduled",
    to: "retryable",
    at: "2026-08-25T13:00:00.000Z",
  });
  assert.equal(
    migrated.channels.instagram.stage,
    state.channels.instagram.stage,
  );
  assert.throws(
    () =>
      migrateControlledYouTubeToBuffer(
        migrated,
        new Date("2026-08-25T14:00:00Z"),
      ),
    /not eligible/,
  );
});
