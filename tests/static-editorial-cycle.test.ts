import assert from "node:assert/strict";
import test from "node:test";
import { runStaticEditorialCycle } from "../src/static-editorial/cycle.js";

const pending = [{ opaqueId: "pending-a" }, { opaqueId: "pending-b" }];
const approved = [
  {
    opaqueId: "new-a",
    accountChannelKey: "instagram:account-1",
    decision: "ready" as const,
  },
  {
    opaqueId: "new-b",
    accountChannelKey: "instagram:account-1",
    decision: "ready" as const,
  },
  {
    opaqueId: "held-a",
    accountChannelKey: "facebook:account-2",
    decision: "held" as const,
  },
];

test("reconciles first and schedules one new target per account and channel", async () => {
  const events: string[] = [];
  const result = await runStaticEditorialCycle({
    mode: "scheduled",
    pending,
    approved,
    reconcile: (item) => {
      events.push(`reconcile:${item.opaqueId}`);
      return Promise.resolve("reconciled" as const);
    },
    schedule: (item) => {
      events.push(`schedule:${item.opaqueId}`);
      return Promise.resolve("accepted" as const);
    },
  });
  assert.deepEqual(events, [
    "reconcile:pending-a",
    "reconcile:pending-b",
    "schedule:new-a",
  ]);
  assert.deepEqual(result, {
    reconciled: 2,
    uncertain: 0,
    accepted: 1,
    held: 2,
    failed: 0,
  });
});

test("manual reconciliation never creates", async () => {
  let creates = 0;
  const result = await runStaticEditorialCycle({
    mode: "reconcile-only",
    pending,
    approved,
    reconcile: () => Promise.resolve("uncertain" as const),
    schedule: () => {
      creates += 1;
      return Promise.resolve("accepted" as const);
    },
  });
  assert.equal(creates, 0);
  assert.deepEqual(result, {
    reconciled: 0,
    uncertain: 2,
    accepted: 0,
    held: 0,
    failed: 0,
  });
});

test("isolates failures and returns only opaque counts", async () => {
  const result = await runStaticEditorialCycle({
    mode: "scheduled",
    pending: [{ opaqueId: "private-title-must-not-leak" }],
    approved: [
      {
        opaqueId: "private-caption-must-not-leak",
        accountChannelKey: "facebook:a",
        decision: "ready",
      },
    ],
    reconcile: () => Promise.reject(new Error("private body")),
    schedule: () => Promise.resolve("uncertain" as const),
  });
  assert.deepEqual(result, {
    reconciled: 0,
    uncertain: 1,
    accepted: 0,
    held: 0,
    failed: 1,
  });
  assert.doesNotMatch(JSON.stringify(result), /private|title|caption|body/u);
});
