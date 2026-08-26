import assert from "node:assert/strict";
import test from "node:test";

import { parsePublishRequest } from "../src/cli/publish.js";
import { campaignStateFixture } from "./support/state-fixture.js";
import { transitionProvider } from "../src/state/transitions.js";

test("scheduled provider writes remain disabled until AUTO_PUBLISH is true", () => {
  assert.throws(
    () => parsePublishRequest({ mode: "scheduled", autoPublish: false }),
    /disabled/,
  );
});

test("controlled execution requires an exact campaign and confirmation", () => {
  assert.deepEqual(
    parsePublishRequest({
      mode: "controlled",
      autoPublish: false,
      campaignId: "2026-08-27-quick-calculation-v1-0",
      confirmation: "PUBLISH_ONE_CAMPAIGN",
    }),
    {
      mode: "controlled",
      campaignId: "2026-08-27-quick-calculation-v1-0",
    },
  );
  assert.throws(
    () =>
      parsePublishRequest({
        mode: "controlled",
        autoPublish: false,
        campaignId: "2026-08-27-quick-calculation-v1-0",
        confirmation: "publish",
      }),
    /PUBLISH_ONE_CAMPAIGN/,
  );
});

test("provider records follow the media lifecycle before scheduling", () => {
  const state = campaignStateFixture({ instagram: "planned" });
  const rendered = transitionProvider(
    state,
    "instagram",
    "rendered",
    new Date("2026-08-26T09:00:00Z"),
  );
  const deploying = transitionProvider(
    rendered,
    "instagram",
    "deploying",
    new Date("2026-08-26T09:01:00Z"),
  );
  const verified = transitionProvider(
    deploying,
    "instagram",
    "media_verified",
    new Date("2026-08-26T09:02:00Z"),
  );
  assert.equal(verified.channels.instagram.stage, "media_verified");
});
