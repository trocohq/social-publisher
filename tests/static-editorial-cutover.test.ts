import assert from "node:assert/strict";
import test from "node:test";
import {
  buildStaticCutoverRehearsal,
  decideStaticCutover,
  planStaticRollback,
} from "../src/static-editorial/cutover.js";

const records = [
  {
    logicalKey: "a",
    owner: "legacy" as const,
    state: "published" as const,
    media: "static" as const,
    providerId: "provider-a",
    mediaAvailable: true,
    approvalValid: true,
  },
  {
    logicalKey: "b",
    owner: "legacy" as const,
    state: "uncertain" as const,
    media: "video" as const,
    providerId: "provider-b",
    mediaAvailable: true,
    approvalValid: true,
  },
  {
    logicalKey: "c",
    owner: "static" as const,
    state: "approved" as const,
    media: "static" as const,
    mediaAvailable: false,
    approvalValid: false,
  },
];

test("builds a sanitized rehearsal without mutating receipts", () => {
  const snapshot = structuredClone(records);
  assert.deepEqual(buildStaticCutoverRehearsal(records), {
    total: 3,
    byOwner: { legacy: 2, static: 1 },
    byState: { approved: 1, uncertain: 1, published: 1 },
    byMedia: { static: 2, video: 1, unknown: 0 },
    conflictingLogicalKeys: [],
    ambiguous: 1,
    missingMedia: 1,
    invalidApprovals: 1,
    queueDemand: 1,
  });
  assert.deepEqual(records, snapshot);
});

test("requires freeze, reconciliation and owner fence before enablement", () => {
  assert.deepEqual(
    decideStaticCutover({
      oldCreationFrozen: true,
      pendingReconciled: false,
      ownerFencePersisted: true,
      executorEnabled: false,
    }),
    { kind: "blocked", reason: "STATIC_CUTOVER_PENDING_RECONCILIATION" },
  );
  assert.deepEqual(
    decideStaticCutover({
      oldCreationFrozen: true,
      pendingReconciled: true,
      ownerFencePersisted: true,
      executorEnabled: false,
    }),
    { kind: "ready-to-enable" },
  );
});

test("rollback preserves IDs while stopping both creators", () => {
  assert.deepEqual(planStaticRollback(), {
    stopNewCreation: true,
    preserveProviderIds: true,
    reconcileExisting: true,
    reenableLegacyCreation: false,
  });
});
