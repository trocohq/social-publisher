import assert from "node:assert/strict";
import test from "node:test";

import { loadBrand } from "../src/brand/load-brand.js";
import type { CampaignPlan } from "../src/editorial/schema.js";
import { createCampaign } from "../src/planning/create-campaign.js";
import { createThumbnailCopy } from "../src/render/thumbnail-copy.js";
import {
  createVerticalSceneSvg,
  createVerticalThumbnailSvg,
  thumbnailStackLayout,
} from "../src/render/svg.js";
import { canonicalBrandRoot } from "./support/brand-root.js";

function exactPaymentPlan(): CampaignPlan {
  const plan = createCampaign({
    localDate: "2026-08-27",
    publishTime: "12:17",
    history: [],
  });
  return {
    ...plan,
    scenario: {
      purchaseMinor: 5_000,
      receivedMinor: 5_000,
      resultMinor: 0,
      breakdown: [],
    },
    copy: { ...plan.copy, answer: "R$ 0,00" },
  };
}

test("thumbnail copy is short, deterministic, and keeps the answer hidden", () => {
  const plan = createCampaign({
    localDate: "2026-08-27",
    publishTime: "12:17",
    history: [],
  });
  const first = createThumbnailCopy(plan);
  const second = createThumbnailCopy(plan);

  assert.equal(first, second);
  assert.match(first, /^R\$\s.+ para pagar R\$\s.+\. Quanto volta\?$/u);
  assert.doesNotMatch(first, /https?:|#|troco\.net/iu);
  assert.ok(!first.includes(plan.copy.answer));
  assert.ok(first.length <= 64);
});

test("exact payment uses a truthful thumbnail question", () => {
  assert.equal(
    createThumbnailCopy(exactPaymentPlan()),
    "R$\u00a050,00 para pagar R$\u00a050,00. Tem troco?",
  );
});

test("thumbnail composition is centered and crop safe with forty-pixel gaps", async () => {
  const plan = createCampaign({
    localDate: "2026-08-27",
    publishTime: "12:17",
    history: [],
  });
  const brand = await loadBrand(canonicalBrandRoot());
  const layout = thumbnailStackLayout(plan);
  const thumbnail = createVerticalThumbnailSvg({ plan, brand });
  const hook = createVerticalSceneSvg({ plan, brand, scene: "hook" });

  assert.equal(layout.messageTop - layout.headerBottom, 40);
  assert.equal(layout.ctaTop - layout.messageBottom, 40);
  assert.ok(layout.top >= 420);
  assert.ok(layout.bottom <= 1500);
  assert.equal(hook, thumbnail);
  assert.match(thumbnail, />FAÇA A CONTA<\/text>/u);
  assert.match(thumbnail, />DESCUBRA NO VÍDEO<\/text>/u);
  assert.match(thumbnail, />12s →<\/text>/u);
  assert.match(thumbnail, /<image x="30"/u);
  assert.doesNotMatch(thumbnail, /01\/04/u);
});
