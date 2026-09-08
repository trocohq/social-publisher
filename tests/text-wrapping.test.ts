import assert from "node:assert/strict";
import test from "node:test";
import { readdir, readFile } from "node:fs/promises";
import { loadBrand } from "../src/brand/load-brand.js";
import { outlineText, canonicalTextMeasure } from "../src/render/font-paths.js";
import { fitText } from "../src/render/text-layout.js";
import type { CampaignPlan } from "../src/editorial/schema.js";
import { createFeedSlideSvg } from "../src/render/svg.js";
import { createCampaign } from "../src/planning/create-campaign.js";
import { canonicalBrandRoot } from "./support/brand-root.js";

test("feed and carousel text respects actual canonical glyph widths", async () => {
  const brand = await loadBrand(canonicalBrandRoot());
  const plans = ["2026-08-27", "2026-08-29", "2026-09-04"].map((date) =>
    createCampaign({
      localDate: date,
      publishTime: "12:17",
      history: [],
    }),
  );
  const states = new URL("../state/campaigns/", import.meta.url);
  for (const file of await readdir(states)) {
    if (file.endsWith(".json"))
      plans.push(
        (
          JSON.parse(await readFile(new URL(file, states), "utf8")) as {
            plan: CampaignPlan;
          }
        ).plan,
      );
  }
  for (const original of plans) {
    const date = original.id;
    for (const mediaKind of ["image", "carousel"] as const) {
      const plan = {
        ...original,
        mediaKind,
        slideCount: mediaKind === "carousel" ? 4 : 1,
      };
      for (let slide = 0; slide < plan.slideCount; slide++) {
        const svg = createFeedSlideSvg({ plan, brand, slide });
        const blocks = [
          ...svg.matchAll(
            /<g data-feed-text="true" data-x="([\d.]+)"[^>]*font-family="(Stolzl|Figtree)" font-size="([\d.]+)" font-weight="(\d+)" aria-label="([^"]*)"/g,
          ),
        ];
        assert.ok(blocks.length > 0);
        for (const match of blocks) {
          const text = match[5]!
            .replace(/&amp;/g, "&")
            .replace(/&apos;/g, "'")
            .replace(/&quot;/g, '"')
            .replace(/&gt;/g, ">")
            .replace(/&lt;/g, "<");
          const ink = outlineText({
            bytes: match[2] === "Stolzl" ? brand.stolzl : brand.figtree,
            text,
            size: Number(match[3]),
            weight: Number(match[4]),
          });
          const x = Number(match[1]);
          assert.ok(
            x + ink.right - Math.min(0, ink.left) <= 1050,
            `${date}/${mediaKind}/${slide}: ${text} extends to ${x + ink.right}`,
          );
        }
      }
    }
  }
});

test("real-font fitting preserves explicit breaks and currency tokens", async () => {
  const brand = await loadBrand(canonicalBrandRoot());
  const layout = fitText("Confira o valor.\nRecebeu R$ 500,00", {
    maxWidth: 600,
    maxHeight: 500,
    maximumFontSize: 92,
    minimumFontSize: 64,
    measure: canonicalTextMeasure(brand.stolzl),
  });
  assert.ok(
    layout.lines.includes("Confira o") ||
      layout.lines.includes("Confira o valor."),
  );
  assert.ok(layout.lines.some((line) => line.includes("R$ 500,00")));
  assert.ok(layout.width <= 600 && layout.height <= 500);
});

test("unfittable text is rejected instead of overflowing its card", async () => {
  const brand = await loadBrand(canonicalBrandRoot());
  assert.throws(
    () =>
      fitText("Um texto muito longo para esta área", {
        maxWidth: 80,
        maxHeight: 50,
        maximumFontSize: 92,
        minimumFontSize: 64,
        measure: canonicalTextMeasure(brand.stolzl),
      }),
    /does not fit/,
  );
});
