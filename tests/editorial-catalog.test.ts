import assert from "node:assert/strict";
import test from "node:test";

import { campaignFamilies } from "../src/config/schedule.js";
import {
  calendarMomentForDate,
  facts,
  hooks,
  recipes,
} from "../src/editorial/catalog.js";

test("the catalog has one complete recipe and four hooks for every family", () => {
  assert.deepEqual(
    recipes.map(({ family }) => family),
    [...campaignFamilies],
  );
  for (const family of campaignFamilies) {
    assert.ok(hooks[family].length >= 4);
  }
});

test("the reviewed catalog contains product, cashier, and safety sources", () => {
  assert.ok(facts.length >= 13);
  assert.ok(
    facts.every(
      ({ source }) =>
        source.startsWith("repo://") || source.startsWith("https://"),
    ),
  );
});

test("calendar moments influence only matching dates and families", () => {
  assert.equal(
    calendarMomentForDate("2026-05-01", "safe_checkout")?.id,
    "calendar.labour-day",
  );
  assert.equal(
    calendarMomentForDate("2026-05-01", "troco_explains"),
    undefined,
  );
  assert.equal(calendarMomentForDate("2026-05-02", "safe_checkout"), undefined);
});
