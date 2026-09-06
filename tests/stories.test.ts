import assert from "node:assert/strict";
import test from "node:test";
import {
  deliverStory,
  prepareStory,
  storyText,
} from "../src/publishing/stories.js";
import { createBufferPostInput } from "../src/networks/buffer/posts.js";
import { campaignStateSchema } from "../src/state/schema.js";
import { assertPublisherHealthy } from "../src/publishing/health.js";
import { campaignStateFixture } from "./support/state-fixture.js";
import { publisherEnvironmentFixture } from "./support/environment-fixture.js";
import { mediaRecordFromState } from "../src/media/manifest.js";
import { publicMediaUrls } from "../src/media/pages.js";

const now = new Date("2026-09-08T15:20:00Z");
const environment = publisherEnvironmentFixture();
const pending = () =>
  campaignStateSchema.parse({
    ...campaignStateFixture({ instagram: "published" }),
    instagramStory: { stage: "pending" },
  });
const prepared = () => prepareStory(pending(), now);
const empty = () =>
  Response.json({
    data: { posts: { edges: [], pageInfo: { hasNextPage: false } } },
  });

test("Stories wait for primary confirmation and preserve legacy state", () => {
  const legacy = campaignStateFixture({ instagram: "published" });
  assert.equal(prepareStory(legacy, now), legacy);
  const scheduled = pending();
  scheduled.channels.instagram.stage = "scheduled";
  assert.equal(prepareStory(scheduled, now), scheduled);
  const result = prepared();
  assert.equal(result.instagramStory?.stage, "uncertain");
  assert.equal(prepareStory(result, now), result);
  assert.deepEqual(result.channels, pending().channels);
});

test("a fresh persisted Story intent sends one story after reconciliation", async () => {
  let creates = 0;
  const state = prepared();
  const result = await deliverStory({
    state,
    environment,
    now,
    allowCreate: true,
    fetchImplementation: async (_url, options) => {
      const body = JSON.parse(String(options?.body));
      if (!body.query.includes("mutation")) return empty();
      creates++;
      assert.equal(body.variables.input.metadata.instagram.type, "story");
      assert.equal(
        body.variables.input.metadata.instagram.shouldShareToFeed,
        false,
      );
      assert.equal(body.variables.input.mode, "shareNow");
      assert.equal(body.variables.input.assets.length, 1);
      assert.notEqual(
        body.variables.input.text,
        state.plan.copy.channels.instagram.caption,
      );
      return Response.json({
        data: { createPost: { post: { id: "story-1", status: "sent" } } },
      });
    },
  });
  assert.equal(creates, 1);
  assert.equal(result.instagramStory?.stage, "published");
  assert.deepEqual(result.channels, state.channels);
  await deliverStory({
    state: result,
    environment,
    now,
    allowCreate: true,
    fetchImplementation: async () => {
      throw new Error("Published Story must not call provider");
    },
  });
});

test("an uncertain old intent is reconciled but never blindly recreated", async () => {
  let requests = 0;
  const result = await deliverStory({
    state: prepared(),
    environment,
    now,
    allowCreate: false,
    fetchImplementation: async (_url, options) => {
      requests++;
      assert.ok(!String(options?.body).includes("mutation"));
      return empty();
    },
  });
  assert.equal(requests, 1);
  assert.equal(result.instagramStory?.stage, "uncertain");
  assert.throws(
    () => assertPublisherHealthy([result], now),
    /Instagram Stories/,
  );
});

test("timeout recovery adopts the existing Story without creating another", async () => {
  const state = prepared();
  const timeout = await deliverStory({
    state,
    environment,
    now,
    allowCreate: true,
    fetchImplementation: async (_url, options) => {
      if (!String(options?.body).includes("mutation")) return empty();
      throw new Error("timeout after acceptance");
    },
  });
  assert.equal(timeout.instagramStory?.stage, "uncertain");
  const recovered = await deliverStory({
    state: timeout,
    environment,
    now,
    allowCreate: false,
    fetchImplementation: async (_url, options) => {
      assert.ok(!String(options?.body).includes("mutation"));
      return Response.json({
        data: {
          posts: {
            edges: [
              {
                node: {
                  id: "story-recovered",
                  status: "sent",
                  channelId: "ig_1",
                  text: storyText(state),
                  dueAt: now.toISOString(),
                  assets: [
                    {
                      source: publicMediaUrls(
                        environment.pagesOrigin,
                        mediaRecordFromState(state),
                      ).video,
                    },
                  ],
                },
              },
            ],
            pageInfo: { hasNextPage: false },
          },
        },
      });
    },
  });
  assert.equal(recovered.instagramStory?.providerId, "story-recovered");
  assert.equal(recovered.instagramStory?.stage, "published");
  assert.equal(recovered.instagramStory?.lastError, undefined);
});

test("accepted Story IDs reconcile independently of the primary post", async () => {
  const state = campaignStateSchema.parse({
    ...prepared(),
    instagramStory: {
      stage: "accepted",
      intentAt: now.toISOString(),
      providerId: "story-2",
    },
  });
  const result = await deliverStory({
    state,
    environment,
    now,
    allowCreate: false,
    fetchImplementation: async () =>
      Response.json({
        data: {
          posts: {
            edges: [
              { node: { id: "story-2", channelId: "ig_1", status: "sent" } },
            ],
            pageInfo: { hasNextPage: false },
          },
        },
      }),
  });
  assert.equal(result.instagramStory?.stage, "published");
  assert.equal(result.instagramStory?.providerId, "story-2");
});

test("disabled Instagram never submits a Story", async () => {
  const state = prepared();
  assert.equal(
    await deliverStory({
      state,
      environment: publisherEnvironmentFixture({ instagram: false }),
      now,
      allowCreate: true,
      fetchImplementation: async () => {
        throw new Error("Must not call provider");
      },
    }),
    state,
  );
});

test("Story payloads reject unsupported placements", () => {
  assert.throws(
    () =>
      createBufferPostInput({
        channel: "tiktok",
        channelId: "tt",
        text: "text",
        dueAt: now.toISOString(),
        phase: "publishing",
        mediaKind: "video",
        mediaUrls: ["https://example.com/video.mp4"],
        placement: "story",
      }),
    /Instagram/,
  );
});
