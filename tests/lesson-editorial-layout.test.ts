import assert from "node:assert/strict";
import test from "node:test";
import { loadBrand } from "../src/brand/load-brand.js";
import { createCampaign } from "../src/planning/create-campaign.js";
import { createVerticalSceneSvg } from "../src/render/svg.js";
import { canonicalBrandRoot } from "./support/brand-root.js";
import { fitText, lessonTextLayouts } from "../src/render/text-layout.js";

test("lesson currency symbols stay with their amounts", () => {
  const layout = fitText(
    "R$ 20 + R$ 10 = R$ 30.",
    lessonTextLayouts.explanation,
  );
  assert.ok(layout.lines.every((line) => !line.endsWith("R$")));
});

test("lesson scenes use text-first hierarchy and generous lateral whitespace", async () => {
  const plan = createCampaign({
    localDate: "2026-09-08",
    publishTime: "12:17",
    history: [],
  });
  assert.ok(plan.copy.lesson);
  const brand = await loadBrand(canonicalBrandRoot());
  for (const scene of ["hook", "scenario", "answer", "end_card"] as const) {
    const svg = createVerticalSceneSvg({ plan, brand, scene });
    assert.ok(!svg.includes('aria-label="NA PRÁTICA"'));
    const lines = [
      ...svg.matchAll(
        /font-family="Manrope" font-size="([\d.]+)"[^>]*data-ink-width="([\d.]+)"/g,
      ),
    ];
    assert.ok(lines.length > 0);
    for (const line of lines) {
      assert.ok(Number(line[1]) <= (scene === "hook" ? 124 : 88));
      assert.ok(Number(line[2]) <= 920.001);
    }
  }
});
