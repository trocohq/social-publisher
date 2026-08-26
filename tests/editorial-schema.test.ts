import assert from "node:assert/strict";
import test from "node:test";

import {
  assertFactUsable,
  campaignPlanSchema,
  factSchema,
} from "../src/editorial/schema.js";

function validPlan(): Record<string, unknown> {
  return {
    schemaVersion: 1,
    id: "2026-08-26-troco-explains-v1-0",
    localDate: "2026-08-26",
    targetAt: "2026-08-26T12:17:00-03:00",
    family: "troco_explains",
    recipeId: "troco-explains-v1",
    recipeVersion: 1,
    candidate: 0,
    seed: "2026-08-26:troco_explains:1",
    palette: "green",
    ctaKind: "download",
    mediaKind: "feed",
    slideCount: 1,
    scenario: {
      purchaseMinor: 8265,
      receivedMinor: 10000,
      resultMinor: 1735,
      outcome: "change_due",
      breakdown: [{ denominationMinor: 1000, quantity: 1 }],
    },
    copy: {
      headline: "Quanto devolver?",
      answer: "R$ 17,35",
      explanation: "Confira o valor antes de entregar.",
      cta: "Baixe o Troco na Google Play.",
      channels: {
        instagram: { caption: "Legenda Instagram" },
        facebook: { caption: "Legenda Facebook" },
        tiktok: { caption: "Legenda TikTok", title: "Troco certo" },
        youtube: { title: "Troco certo #Shorts", description: "Descrição YouTube" },
      },
    },
    sourceIds: ["product.change-calculation"],
    fingerprints: { headline: "a".repeat(64), caption: "b".repeat(64) },
  };
}

test("facts require a traceable source", () => {
  assert.throws(
    () =>
      factSchema.parse({
        id: "unsafe",
        statement: "Invented",
        families: ["safe_checkout"],
        reviewedOn: "2026-08-26",
      }),
    /source/,
  );
});

test("expired or incompatible facts cannot enter a campaign", () => {
  const fact = factSchema.parse({
    id: "fact.expired",
    statement: "Regra vencida",
    source: "repo://frontend/example.ts",
    reviewedOn: "2026-01-01",
    expiresOn: "2026-08-25",
    families: ["safe_checkout"],
  });
  assert.throws(
    () => assertFactUsable(fact, "2026-08-26", "safe_checkout"),
    /expired/,
  );
  assert.throws(
    () => assertFactUsable({ ...fact, expiresOn: undefined }, "2026-08-26", "troco_explains"),
    /family/,
  );
});

test("campaign plans reject markup in public copy", () => {
  const plan = validPlan();
  const copy = plan.copy as Record<string, unknown>;
  copy.headline = "<script>";
  assert.throws(() => campaignPlanSchema.parse(plan), /Markup is forbidden/);
});

test("campaign plans require a correctly formatted numeric answer", () => {
  const plan = validPlan();
  const copy = plan.copy as Record<string, unknown>;
  copy.answer = "R$ 17,36";
  assert.throws(() => campaignPlanSchema.parse(plan), /scenario result/);
});

test("channel copy limits are enforced before provider calls", () => {
  const plan = validPlan();
  const copy = plan.copy as {
    channels: { instagram: { caption: string } };
  };
  copy.channels.instagram.caption = "a".repeat(2_201);
  assert.throws(() => campaignPlanSchema.parse(plan), /2200/);
});
