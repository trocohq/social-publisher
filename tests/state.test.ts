import assert from "node:assert/strict";
import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { markDisabledChannels } from "../src/state/channel-availability.js";
import { sanitizeError } from "../src/state/sanitize.js";
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
