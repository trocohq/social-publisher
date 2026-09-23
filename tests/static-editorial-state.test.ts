import assert from "node:assert/strict";
import test from "node:test";

import {
  defineStaticRecord,
  rescheduleHeld,
} from "../src/static-editorial/state.js";

const record = defineStaticRecord({
  schemaVersion: 1,
  logicalKey: "troco-editorial-0001:instagram:feed",
  id: "troco-editorial-0001",
  brand: "troco",
  channel: "instagram",
  placement: "feed",
  owner: "static-runner",
  fence: 1,
  approvalRevision: `sha256:${"a".repeat(64)}`,
  publishAt: "2026-09-14T12:00:00-03:00",
  state: "held",
  heldReason: "MISSED_UNSCHEDULED_TIME",
  attempts: [],
  history: [],
});

test("preserves logical identity and old timestamp when explicitly rescheduled", () => {
  const updated = rescheduleHeld(
    record,
    {
      approvalRevision: `sha256:${"b".repeat(64)}`,
      publishAt: "2026-09-20T12:00:00-03:00",
      approvedAt: "2026-09-14T13:00:00-03:00",
    },
    new Date("2026-09-14T12:00:00-03:00"),
  );
  assert.equal(updated.logicalKey, record.logicalKey);
  assert.deepEqual(updated.history[0], {
    publishAt: record.publishAt,
    heldReason: record.heldReason,
  });
  assert.equal(updated.state, "approved");
});

test("refuses to reschedule attempted or published work", () => {
  assert.throws(() =>
    rescheduleHeld(
      { ...record, state: "published" },
      {
        approvalRevision: `sha256:${"b".repeat(64)}`,
        publishAt: "2026-09-20T12:00:00-03:00",
        approvedAt: "2026-09-14T13:00:00-03:00",
      },
      new Date(),
    ),
  );
});
