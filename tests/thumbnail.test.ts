import assert from "node:assert/strict";
import test from "node:test";

import { loadBrand } from "../src/brand/load-brand.js";
import type { CampaignPlan } from "../src/editorial/schema.js";
import { createCampaign } from "../src/planning/create-campaign.js";
import { createThumbnailCopy } from "../src/render/thumbnail-copy.js";
import {
  createVerticalSceneSvg,
  createVerticalThumbnailSvg,
} from "../src/render/svg.js";
import * as svgRenderer from "../src/render/svg.js";
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

test("thumbnail shares the hook's centered and square-crop-safe stack", async () => {
  const plan = createCampaign({
    localDate: "2026-08-27",
    publishTime: "12:17",
    history: [],
  });
  const brand = await loadBrand(canonicalBrandRoot());
  assert.equal(typeof svgRenderer.verticalStackLayout, "function");
  const layout = svgRenderer.verticalStackLayout(plan, "hook");
  const thumbnail = createVerticalThumbnailSvg({ plan, brand });
  const hook = createVerticalSceneSvg({ plan, brand, scene: "hook" });

  assert.ok(layout.top >= 420);
  assert.ok(layout.bottom <= 1500);
  assert.equal(layout.top + layout.height, layout.bottom);
  assert.equal(layout.top + layout.bottom, layout.safeTop + layout.safeBottom);
  assert.equal(hook, thumbnail);
  assert.match(thumbnail, /aria-label="FAÇA A CONTA"/u);
  assert.match(thumbnail, /aria-label="DESCUBRA NO VÍDEO"/u);
  assert.match(thumbnail, /aria-label="12s →"/u);
  assert.match(
    thumbnail,
    /<g data-vertical-stack="true" transform="translate\(540 [\d.]+\)" text-anchor="middle">/u,
  );
  assert.doesNotMatch(thumbnail, /01\/04/u);
});
