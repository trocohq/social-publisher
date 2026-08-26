import assert from "node:assert/strict";
import test from "node:test";

import {
  assertPublicationSucceeded,
  executePublication,
  reconcilePublication,
} from "../src/publishing/execute.js";
import { assertPublisherHealthy } from "../src/publishing/health.js";
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
  assert.throws(
    () => assertPublicationSucceeded(result, "instagram"),
    /retryable/,
  );
});

test("health rejects unresolved provider failures before incident recovery", () => {
  assert.throws(
    () =>
      assertPublisherHealthy([
        campaignStateFixture({ instagram: "retryable" }),
      ]),
    /unresolved publication failure/i,
  );
  assert.doesNotThrow(() =>
    assertPublisherHealthy(
      [
        campaignStateFixture({
          instagram: "scheduled",
          facebook: "published",
          tiktok: "scheduled",
          youtube: "published",
        }),
      ],
      new Date("2026-08-26T14:00:00Z"),
    ),
  );
  assert.throws(
    () =>
      assertPublisherHealthy(
        [campaignStateFixture({ instagram: "scheduled" })],
        new Date("2026-08-26T16:00:00Z"),
      ),
    /overdue publication/i,
  );
});

test("scheduled provider records reconcile to published after their due time", async () => {
  const state = campaignStateFixture({ instagram: "scheduled" });
  const result = await reconcilePublication({
    state,
    channel: "instagram",
    reconcile: async () => ({
      id: "post_1",
      status: "published",
      dueAt: state.plan.targetAt,
    }),
    now: new Date("2026-08-26T16:00:00Z"),
  });
  assert.equal(result.matched, true);
  assert.equal(result.state.channels.instagram.stage, "published");
});

test("reconciliation persists asynchronous provider failures", async () => {
  let persistedStage = "";
  const result = await reconcilePublication({
    state: campaignStateFixture({ instagram: "scheduled" }),
    channel: "instagram",
    reconcile: async () => ({
      kind: "permanent_error",
      category: "buffer_async_failure",
      message: "Buffer reported an asynchronous delivery failure",
    }),
    now: new Date("2026-08-26T16:00:00Z"),
    persist: async (state) => {
      persistedStage = state.channels.instagram.stage;
    },
  });
  assert.equal(result.state.channels.instagram.stage, "failed");
  assert.equal(persistedStage, "failed");
});

test("an overdue scheduled record missing from its provider becomes retryable", async () => {
  const result = await reconcilePublication({
    state: campaignStateFixture({ instagram: "scheduled" }),
    channel: "instagram",
    reconcile: async () => undefined,
    now: new Date("2026-08-26T16:00:00Z"),
  });
  assert.equal(result.state.channels.instagram.stage, "retryable");
  assert.equal(
    result.state.channels.instagram.lastError?.category,
    "provider_reconciliation_missing",
  );
});
