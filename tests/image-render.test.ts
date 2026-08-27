import assert from "node:assert/strict";
import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import sharp from "sharp";

import fixture from "../assets/fixtures/worst-case-campaign.json" with { type: "json" };
import { loadBrand } from "../src/brand/load-brand.js";
import { createCampaign } from "../src/planning/create-campaign.js";
import { renderFeed } from "../src/render/image.js";
import { createFeedSlideSvg, fitText } from "../src/render/svg.js";

const frontendPublic = new URL("../../frontend/public/", import.meta.url);

test("feed output is deterministic 1080 by 1350 sRGB JPEG", async () => {
  const output = await mkdtemp(join(tmpdir(), "troco-feed-"));
  const plan = createCampaign({
    localDate: "2026-08-26",
    publishTime: "12:17",
    history: [],
  });
  const brand = await loadBrand(frontendPublic);
  const first = await renderFeed({ plan, brand, output });
  const second = await renderFeed({ plan, brand, output });
  const firstFile = first.files[0];

  assert.ok(firstFile);
  const metadata = await sharp(firstFile).metadata();
  assert.deepEqual(
    [metadata.width, metadata.height, metadata.format, metadata.space],
    [1080, 1350, "jpeg", "srgb"],
  );
  assert.equal(first.files.length, 1);
  assert.equal(first.hashes[0], second.hashes[0]);
  assert.ok((await readFile(firstFile)).length < 8_000_000);
});

test("a carousel campaign renders two to five equal-size slides", async () => {
  const output = await mkdtemp(join(tmpdir(), "troco-carousel-"));
  const plan = createCampaign({
    localDate: "2026-08-25",
    publishTime: "12:17",
    history: [],
  });
  const brand = await loadBrand(frontendPublic);
  const rendered = await renderFeed({ plan, brand, output });

  assert.ok(rendered.files.length >= 2 && rendered.files.length <= 5);
  for (const file of rendered.files) {
    const metadata = await sharp(file).metadata();
    assert.deepEqual([metadata.width, metadata.height], [1080, 1350]);
  }
});

test("worst-case editorial text fits inside the 96 pixel safe area", () => {
  const display = fitText(fixture.headline, {
    maxWidth: 888,
    maxHeight: 600,
    maximumFontSize: 86,
    minimumFontSize: 64,
  });
  const body = fitText(fixture.explanation, {
    maxWidth: 888,
    maxHeight: 650,
    maximumFontSize: 42,
    minimumFontSize: 34,
  });

  assert.ok(display.width <= 888 && display.height <= 600);
  assert.ok(body.width <= 888 && body.height <= 650);
  assert.ok(display.fontSize >= 64);
  assert.ok(body.fontSize >= 34);
});

test("feed hierarchy uses larger type and a distinct call-to-action stage", async () => {
  const plan = createCampaign({
    localDate: "2026-08-27",
    publishTime: "12:17",
    history: [],
  });
  const brand = await loadBrand(frontendPublic);
  const svg = createFeedSlideSvg({ plan, brand, slide: 0 });
  const headlineSize = Number(
    svg.match(
      /<text x="96" y="\d+"[^>]*font-family="Stolzl" font-size="(\d+)"/,
    )?.[1],
  );

  assert.ok(headlineSize >= 88, `headline rendered at ${headlineSize}px`);
  assert.match(svg, /font-family="Stolzl" font-size="54">R\$/u);
  assert.match(svg, /font-family="Stolzl" font-size="68">R\$/u);
  assert.match(
    svg,
    /<rect x="96" y="1160" width="888" height="118"[^>]*fill="#213130"/u,
  );
  assert.match(
    svg,
    /<text x="144" y="\d+" fill="#FEFDFB" font-family="Figtree" font-size="40" font-weight="700">/u,
  );
});
