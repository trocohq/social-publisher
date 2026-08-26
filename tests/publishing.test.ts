import assert from "node:assert/strict";
import test from "node:test";

import { executePublication } from "../src/publishing/execute.js";
import { nextPublicationAction } from "../src/publishing/next-action.js";
import { campaignStateFixture } from "./support/state-fixture.js";

test("the next action skips successful siblings and selects one retryable channel", () => {
  const state = campaignStateFixture({
    instagram: "scheduled",
    facebook: "retryable",
    tiktok: "scheduled",
    youtube: "scheduled",
  });
  assert.deepEqual(
    nextPublicationAction([state], new Date("2026-08-26T10:00:00Z")),
    {
      campaignId: state.plan.id,
      localDate: "2026-08-26",
      channel: "facebook",
      phase: "scheduling",
    },
  );
});

test("execution records a reconciled provider object without creating another", async () => {
  let createCalls = 0;
  const result = await executePublication({
    state: campaignStateFixture({ instagram: "scheduling" }),
    channel: "instagram",
    reconcile: async () => ({
      id: "existing_1",
      dueAt: "2026-08-26T15:17:00Z",
      status: "scheduled",
    }),
    create: async () => {
      createCalls += 1;
      throw new Error("must not create");
    },
    now: new Date("2026-08-26T10:00:00Z"),
  });
  assert.equal(createCalls, 0);
  assert.equal(result.channels.instagram.providerId, "existing_1");
  assert.equal(result.channels.instagram.stage, "scheduled");
});

test("a retryable provider failure changes only the active channel", async () => {
  const state = campaignStateFixture({
    instagram: "scheduling",
    youtube: "published",
  });
  const result = await executePublication({
    state,
    channel: "instagram",
    reconcile: async () => undefined,
    create: async () => {
      throw Object.assign(new Error("temporary"), {
        retryable: true,
        statusCode: 503,
      });
    },
    now: new Date("2026-08-26T10:00:00Z"),
  });
  assert.equal(result.channels.instagram.stage, "retryable");
  assert.equal(result.channels.youtube.stage, "published");
});
