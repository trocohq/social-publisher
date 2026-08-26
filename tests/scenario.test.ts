import assert from "node:assert/strict";
import test from "node:test";

import { createScenario } from "../src/editorial/scenario.js";

test("a BRL scenario comes from shared integer-money contracts", () => {
  assert.deepEqual(createScenario(8265, 10000), {
    purchaseMinor: 8265,
    receivedMinor: 10000,
    resultMinor: 1735,
    outcome: "change_due",
    breakdown: [
      { denominationMinor: 1000, quantity: 1 },
      { denominationMinor: 500, quantity: 1 },
      { denominationMinor: 200, quantity: 1 },
      { denominationMinor: 25, quantity: 1 },
      { denominationMinor: 10, quantity: 1 },
    ],
  });
});

test("an exact payment has no denomination breakdown", () => {
  assert.deepEqual(createScenario(5000, 5000), {
    purchaseMinor: 5000,
    receivedMinor: 5000,
    resultMinor: 0,
    outcome: "exact_amount",
    breakdown: [],
  });
});

test("invalid minor-unit values are rejected by shared contracts", () => {
  assert.throws(() => createScenario(10.5, 100), /expected int/);
});
