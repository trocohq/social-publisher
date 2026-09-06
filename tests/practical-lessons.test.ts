import assert from "node:assert/strict";
import test from "node:test";
import { facts } from "../src/editorial/catalog.js";
import { createCampaignCopy } from "../src/editorial/copy.js";
import {
  createCampaign,
  historyEntryFromCampaign,
} from "../src/planning/create-campaign.js";
import { campaignPlanSchema } from "../src/editorial/schema.js";
import type { HistoryEntry } from "../src/editorial/select.js";
import { createVerticalSceneSvg, verticalScenes } from "../src/render/svg.js";
import { createThumbnailCopy } from "../src/render/thumbnail-copy.js";
import { loadBrand } from "../src/brand/load-brand.js";
import { canonicalBrandRoot } from "./support/brand-root.js";

test("all twelve practical lessons fit the approved vertical scenes", async () => {
  const lessons = facts.filter((fact) => fact.lesson);
  assert.equal(lessons.length, 12);
  const brand = await loadBrand(canonicalBrandRoot());
  const base = createCampaign({
    localDate: "2026-08-26",
    publishTime: "12:17",
    history: [],
  });
  for (const fact of lessons) {
    const copy = createCampaignCopy({
      campaignId: base.id,
      family: fact.families[0]!,
      hook: "Na prática",
      scenario: base.scenario,
      fact,
      ctaKind: "save_share",
    });
    const plan = campaignPlanSchema.parse({
      ...base,
      family: fact.families[0],
      copy,
      mediaKind: "video",
      slideCount: 1,
    });
    assert.equal(createThumbnailCopy(plan), fact.lesson!.headline);
    assert.doesNotMatch(
      copy.channels.instagram.caption,
      /A resposta é|Uma forma:/,
    );
    for (const scene of verticalScenes) {
      assert.ok(
        createVerticalSceneSvg({ plan, brand, scene }).includes("<svg"),
      );
    }
  }
});

test("new lessons rotate without exhausting the daily planner", () => {
  const history: HistoryEntry[] = [];
  const selected = new Set<string>();
  for (let day = 0; day < 60; day++) {
    const localDate = new Date(Date.UTC(2026, 8, 7 + day))
      .toISOString()
      .slice(0, 10);
    const plan = createCampaign({ localDate, publishTime: "12:17", history });
    assert.equal(plan.recipeVersion, 2);
    if (plan.copy.lesson) selected.add(plan.sourceIds[0]!);
    history.push(historyEntryFromCampaign(plan));
  }
  assert.equal(selected.size, 12);
  assert.equal(
    createCampaign({
      localDate: "2026-08-26",
      publishTime: "12:17",
      history: [],
    }).copy.lesson,
    undefined,
  );
});
