import assert from "node:assert/strict";
import test from "node:test";

import {
  parsePublishRequest,
  providerAdaptersForAction,
} from "../src/cli/publish.js";
import { campaignStateFixture } from "./support/state-fixture.js";
import { transitionProvider } from "../src/state/transitions.js";
import { publisherEnvironmentFixture } from "./support/environment-fixture.js";

test("scheduled provider writes remain disabled until AUTO_PUBLISH is true", () => {
  assert.throws(
    () => parsePublishRequest({ mode: "scheduled", autoPublish: false }),
    /disabled/,
  );
  assert.throws(
    () =>
      parsePublishRequest({
        mode: "scheduled",
        autoPublish: true,
        youtubePublicationVerified: false,
      }),
    /YouTube publication has not been verified/,
  );
  assert.deepEqual(
    parsePublishRequest({
      mode: "scheduled",
      autoPublish: true,
      youtubePublicationVerified: true,
    }),
    { mode: "scheduled" },
  );
  assert.deepEqual(
    parsePublishRequest({
      mode: "scheduled",
      autoPublish: true,
      youtubeEnabled: false,
      youtubePublicationVerified: false,
    }),
    { mode: "scheduled" },
  );
});

test("disabled publication channels are rejected at the adapter boundary", () => {
  assert.throws(
    () =>
      providerAdaptersForAction({
        state: campaignStateFixture({ tiktok: "media_verified" }),
        channel: "tiktok",
        mode: "controlled",
        phase: "scheduling",
        environment: publisherEnvironmentFixture({ tiktok: false }),
        renderRoot: "/tmp/troco-render",
      }),
    /tiktok.*disabled/i,
  );
});

test("YouTube publication uses the public Buffer Short contract", async () => {
  let providerInput: Record<string, unknown> | undefined;
  const state = campaignStateFixture({ youtube: "media_verified" });
  const adapters = providerAdaptersForAction({
    state,
    channel: "youtube",
    mode: "scheduled",
    phase: "scheduling",
    environment: publisherEnvironmentFixture({ tiktok: false }),
    renderRoot: "/tmp/troco-render",
    bufferFetchImplementation: async (_input, init) => {
      const request = JSON.parse(String(init?.body)) as {
        variables: { input: Record<string, unknown> };
      };
      providerInput = request.variables.input;
      return new Response(
        JSON.stringify({
          data: {
            createPost: {
              post: { id: "yt_buffer_1", status: "scheduled" },
            },
          },
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      );
    },
  });

  const result = await adapters.create();

  assert.equal(result?.kind, "success");
  assert.equal(providerInput?.channelId, "yt_1");
  assert.deepEqual(providerInput?.metadata, {
    youtube: {
      title: state.plan.copy.channels.youtube.title,
      categoryId: "27",
      privacy: "public",
      madeForKids: false,
      notifySubscribers: true,
      embeddable: true,
      license: "youtube",
      isAiGenerated: false,
    },
  });
  assert.deepEqual(providerInput?.assets, [
    {
      video: {
        url: `https://trocohq.github.io/social-publisher/media/2026-08-26/${state.plan.id}/video/short.mp4`,
      },
    },
  ]);
});

test("controlled execution requires an exact campaign and confirmation", () => {
  assert.deepEqual(
    parsePublishRequest({
      mode: "controlled",
      autoPublish: false,
      campaignId: "2026-08-27-quick-calculation-v1-0",
      confirmation: "PUBLISH_ONE_CAMPAIGN",
      now: new Date("2026-08-26T12:00:00Z"),
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
        now: new Date("2026-08-26T12:00:00Z"),
      }),
    /PUBLISH_ONE_CAMPAIGN/,
  );
  assert.throws(
    () =>
      parsePublishRequest({
        mode: "controlled",
        autoPublish: false,
        campaignId: "2026-08-26-quick-calculation-v1-0",
        confirmation: "PUBLISH_ONE_CAMPAIGN",
        now: new Date("2026-08-26T12:00:00Z"),
      }),
    /future campaign/,
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
