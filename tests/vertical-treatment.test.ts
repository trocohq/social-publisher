import assert from "node:assert/strict";
import test from "node:test";

import { designTokens } from "@trocohq/design-tokens";

import {
  treatmentForCampaign,
  verticalTreatments,
} from "../src/render/vertical-treatment.js";

test("exports the official vertical treatments in their stable order", () => {
  assert.deepEqual(
    verticalTreatments.map(({ id }) => id),
    ["paper", "ink", "primary", "purple", "yellow", "blue", "coral"],
  );

  const colors = designTokens.colors;
  assert.deepEqual(
    verticalTreatments.map(({ background }) => background),
    [
      colors.paper,
      colors.ink,
      colors.primary,
      colors.purple,
      colors.yellow,
      colors.blue,
      colors.coral,
    ],
  );

  for (const treatment of verticalTreatments) {
    if (treatment.id !== "ink") {
      assert.equal(treatment.foreground, colors.ink);
      assert.equal(treatment.inverse, false);
    }
    assert.equal(treatment.surface, colors.paper);
    assert.equal(treatment.surfaceForeground, colors.ink);
  }

  const ink = verticalTreatments.find(({ id }) => id === "ink");
  assert.ok(ink);
  assert.equal(ink.foreground, colors.paper);
  assert.equal(ink.inverse, true);
  assert.deepEqual(
    verticalTreatments.filter(({ inverse }) => inverse).map(({ id }) => id),
    ["ink"],
  );
});

test("freezes the treatment collection and each treatment", () => {
  assert.equal(Object.isFrozen(verticalTreatments), true);
  for (const treatment of verticalTreatments) {
    assert.equal(Object.isFrozen(treatment), true);
  }
});

test("selects a stable seeded treatment for a campaign", () => {
  const first = treatmentForCampaign("2026-09-01-troco-explains-v1-0");
  assert.equal(treatmentForCampaign("2026-09-01-troco-explains-v1-0"), first);
});

test("rejects blank campaign IDs", () => {
  assert.throws(() => treatmentForCampaign(""), /campaign id/i);
  assert.throws(() => treatmentForCampaign("   \t"), /campaign id/i);
});

test("representative campaign IDs reach every official treatment", () => {
  const observed = new Set<string>();
  for (let index = 0; index < 1_000; index += 1) {
    observed.add(treatmentForCampaign(`campaign-${index}`).id);
  }
  assert.deepEqual([...observed].sort(), [
    "blue",
    "coral",
    "ink",
    "paper",
    "primary",
    "purple",
    "yellow",
  ]);
});
