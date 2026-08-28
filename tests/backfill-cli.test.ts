import assert from "node:assert/strict";
import test from "node:test";

import { parseBackfillArguments } from "../src/cli/backfill-thumbnails.js";

const campaignId = "2026-08-27-quick-calculation-v1-0";

test("backfill preparation is the default and requires one exact campaign", () => {
  assert.deepEqual(
    parseBackfillArguments([
      "--campaign",
      campaignId,
      "--brand-root",
      "../frontend/public",
    ]),
    {
      mode: "prepare",
      campaignId,
      brandRoot: "../frontend/public",
      stateRoot: "state",
      outputRoot: ".tmp/thumbnail-backfill",
    },
  );
  assert.throws(
    () => parseBackfillArguments(["--campaign", "2026-08-27"]),
    /exact campaign/i,
  );
});

test("YouTube execution requires channel, execute, and matching confirmation", () => {
  assert.equal(
    parseBackfillArguments([
      "--campaign",
      campaignId,
      "--brand-root",
      "../frontend/public",
      "--channel",
      "youtube",
      "--execute",
      "--confirm",
      campaignId,
    ]).mode,
    "youtube",
  );
  assert.throws(
    () =>
      parseBackfillArguments([
        "--campaign",
        campaignId,
        "--brand-root",
        "../frontend/public",
        "--channel",
        "youtube",
        "--execute",
      ]),
    /confirmation/i,
  );
});

test("native outcomes reject YouTube and unsupported values", () => {
  assert.equal(
    parseBackfillArguments([
      "--campaign",
      campaignId,
      "--brand-root",
      "../frontend/public",
      "--channel",
      "instagram",
      "--record",
      "updated",
      "--confirm",
      campaignId,
    ]).mode,
    "record",
  );
  assert.throws(
    () =>
      parseBackfillArguments([
        "--campaign",
        campaignId,
        "--brand-root",
        "../frontend/public",
        "--channel",
        "youtube",
        "--record",
        "updated",
        "--confirm",
        campaignId,
      ]),
    /native Meta/i,
  );
});
