import assert from "node:assert/strict";
import test from "node:test";

import { datesNeedingPlans } from "../src/planning/rolling-window.js";

test("planning creates today through six days ahead and never backfills yesterday", () => {
  assert.deepEqual(
    datesNeedingPlans(new Date("2026-08-26T18:00:00Z"), [
      "2026-08-25",
      "2026-08-27",
    ]),
    [
      "2026-08-26",
      "2026-08-28",
      "2026-08-29",
      "2026-08-30",
      "2026-08-31",
      "2026-09-01",
    ],
  );
});

test("rolling planning rejects malformed existing dates", () => {
  assert.throws(
    () => datesNeedingPlans(new Date("2026-08-26T18:00:00Z"), ["tomorrow"]),
    /existing date/i,
  );
});
