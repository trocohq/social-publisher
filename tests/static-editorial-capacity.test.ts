import assert from "node:assert/strict";
import test from "node:test";
import { evaluateStaticCapacity } from "../src/static-editorial/capacity.js";

const now = "2026-09-16T18:00:00.000Z";
const evidence = {
  accountRef: "troco-instagram",
  connected: true,
  paginationComplete: true,
  observedAt: now,
  validUntil: "2026-09-16T18:30:00.000Z",
  limit: 10,
  entries: Array.from({ length: 9 }, (_, index) => ({
    providerId: `post-${index}`,
    status: "scheduled" as const,
  })),
};
const resources = {
  verifiedAt: now,
  validUntil: "2026-10-01T00:00:00.000Z",
  runnerMinutesRemaining: 100,
  storageBytesRemaining: 1_000_000,
  requiredRunnerMinutes: 1,
  requiredStorageBytes: 10_000,
};

test("counts all remote entries, unseen reservations and requested placements", () => {
  assert.deepEqual(
    evaluateStaticCapacity({
      now,
      expectedAccountRef: "troco-instagram",
      evidence,
      resources,
      reservations: [{ logicalKey: "a" }],
      requestedSlots: 1,
    }),
    { kind: "held", reason: "STATIC_CAPACITY_EXHAUSTED" },
  );
  assert.deepEqual(
    evaluateStaticCapacity({
      now,
      expectedAccountRef: "troco-instagram",
      evidence: { ...evidence, entries: evidence.entries.slice(0, 8) },
      resources,
      reservations: [{ logicalKey: "a" }],
      requestedSlots: 1,
    }),
    { kind: "available", remainingSlots: 0 },
  );
});

test("fails closed for incomplete, stale, disconnected and exhausted evidence", () => {
  const cases = [
    [
      { ...evidence, paginationComplete: false },
      resources,
      "STATIC_CAPACITY_INCOMPLETE",
    ],
    [
      { ...evidence, connected: false },
      resources,
      "STATIC_ACCOUNT_DISCONNECTED",
    ],
    [
      { ...evidence, accountRef: "other" },
      resources,
      "STATIC_ACCOUNT_MISMATCH",
    ],
    [
      { ...evidence, validUntil: "2026-09-16T17:59:59.000Z" },
      resources,
      "STATIC_CAPACITY_STALE",
    ],
    [
      evidence,
      { ...resources, runnerMinutesRemaining: 0 },
      "STATIC_FREE_RESOURCE_EXHAUSTED",
    ],
  ] as const;
  for (const [capacity, freeResources, reason] of cases)
    assert.deepEqual(
      evaluateStaticCapacity({
        now,
        expectedAccountRef: "troco-instagram",
        evidence: capacity,
        resources: freeResources,
        reservations: [],
        requestedSlots: 1,
      }),
      { kind: "held", reason },
    );
});

test("does not double count a reservation represented by provider ID", () => {
  assert.deepEqual(
    evaluateStaticCapacity({
      now,
      expectedAccountRef: "troco-instagram",
      evidence,
      resources,
      reservations: [{ logicalKey: "a", providerId: "post-0" }],
      requestedSlots: 1,
    }),
    { kind: "available", remainingSlots: 0 },
  );
});
