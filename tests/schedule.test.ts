import assert from "node:assert/strict";
import test from "node:test";

import { campaignFamilyForDate } from "../src/config/schedule.js";
import {
  calendarDayDistance,
  localDateAt,
  rollingLocalDates,
} from "../src/shared/time.js";

test("Monday selects the change challenge family", () => {
  assert.equal(campaignFamilyForDate("2026-08-31"), "change_challenge");
});

test("the weekly rotation maps every weekday to one family", () => {
  assert.deepEqual(
    [24, 25, 26, 27, 28, 29, 30].map((day) =>
      campaignFamilyForDate(`2026-08-${day}`),
    ),
    [
      "change_challenge",
      "cashier_shortcut",
      "troco_explains",
      "quick_calculation",
      "safe_checkout",
      "checkout_situation",
      "save_this_rule",
    ],
  );
});

test("the rolling window contains today and six future Sao Paulo dates", () => {
  assert.deepEqual(rollingLocalDates(new Date("2026-08-26T16:00:00Z"), 7), [
    "2026-08-26",
    "2026-08-27",
    "2026-08-28",
    "2026-08-29",
    "2026-08-30",
    "2026-08-31",
    "2026-09-01",
  ]);
});

test("Sao Paulo local date is independent from the UTC calendar date", () => {
  assert.equal(localDateAt(new Date("2026-08-27T01:30:00Z")), "2026-08-26");
});

test("calendar distance stays correct across month boundaries", () => {
  assert.equal(calendarDayDistance("2026-08-31", "2026-09-02"), 2);
});
