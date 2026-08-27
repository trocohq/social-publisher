import { join } from "node:path";

import { loadBrand } from "../../src/brand/load-brand.js";
import { createCampaign } from "../../src/planning/create-campaign.js";
import { renderFeed } from "../../src/render/image.js";
import { renderVideo } from "../../src/render/video.js";
import { canonicalBrandRoot } from "./brand-root.js";

export async function renderFixtureCampaign(output: string) {
  const plan = createCampaign({
    localDate: "2026-08-26",
    publishTime: "12:17",
    history: [],
  });
  const brand = await loadBrand(canonicalBrandRoot());
  const feed = await renderFeed({ plan, brand, output: join(output, "feed") });
  const video = await renderVideo({
    plan,
    brand,
    output: join(output, "video"),
  });
  return { plan, feed, video };
}
