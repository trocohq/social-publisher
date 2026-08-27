import assert from "node:assert/strict";
import test from "node:test";

import { campaignFamilies } from "../src/config/schedule.js";
import {
  calendarMomentForDate,
  facts,
  hooks,
  recipes,
  usableFactsForCampaign,
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

test("public facts stay concise and avoid formal filler", () => {
  for (const fact of facts) {
    assert.ok(
      fact.statement.length <= 150,
      `${fact.id} is too long for social media`,
    );
    assert.doesNotMatch(
      fact.statement,
      /está disponível|pode ser usado|oferece cálculo|como conferência|sem complicação/i,
      `${fact.id} still contains mechanical copy`,
    );
  }
});

test("hooks use concrete spoken language without generic filler", () => {
  const everyHook = Object.values(hooks).flat();
  for (const hook of everyHook) {
    assert.doesNotMatch(
      hook,
      /sem complicação|uma conta importante|segurança também é rotina|vale lembrar|cliente pagou/i,
    );
    assert.ok(hook.length <= 48, `${hook} is too long for a visual hook`);
  }
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
  assert.equal(
    calendarMomentForDate("2027-05-01", "safe_checkout", [
      {
        id: "calendar.expired",
        statement: "Momento vencido",
        source: "repo://calendar",
        reviewedOn: "2026-01-01",
        expiresOn: "2026-12-31",
        monthDay: "05-01",
        families: ["safe_checkout"],
      },
    ]),
    undefined,
  );
});

test("campaign fact selection excludes expired catalog entries", () => {
  const values = usableFactsForCampaign(
    [
      {
        id: "fact.expired",
        statement: "Expirado",
        source: "repo://facts",
        reviewedOn: "2026-01-01",
        expiresOn: "2026-08-25",
        families: ["safe_checkout"],
      },
      {
        id: "fact.current",
        statement: "Atual",
        source: "repo://facts",
        reviewedOn: "2026-01-01",
        families: ["safe_checkout"],
      },
    ],
    "2026-08-26",
    "safe_checkout",
  );
  assert.deepEqual(
    values.map((fact) => fact.id),
    ["fact.current"],
  );
});
