import assert from "node:assert/strict";
import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import sharp from "sharp";

import type { CampaignPlan } from "../src/editorial/schema.js";
import { probeVideo } from "../src/render/probe.js";
import { loadBrand } from "../src/brand/load-brand.js";
import { createCampaign } from "../src/planning/create-campaign.js";
import { runProcess } from "../src/render/binaries.js";
import { musicExcerptForDate } from "../src/render/music.js";
import {
  createVerticalSceneSvg,
  createVerticalThumbnailSvg,
} from "../src/render/svg.js";
import * as svgRenderer from "../src/render/svg.js";
import { safeAreaFor } from "../src/render/safe-area.js";
import {
  treatmentForCampaign,
  verticalTreatments,
} from "../src/render/vertical-treatment.js";
import { renderVideo } from "../src/render/video.js";
import { canonicalBrandRoot } from "./support/brand-root.js";
import { renderFixtureCampaign } from "./support/render-fixture.js";

const frontendPublic = canonicalBrandRoot();

test("short output uses its deterministic Enterprise excerpt", async () => {
  const output = await mkdtemp(join(tmpdir(), "troco-short-"));
  const { plan, video } = await renderFixtureCampaign(output);
  const probe = await probeVideo(video.file);

  assert.deepEqual(
    {
      width: probe.width,
      height: probe.height,
      videoCodec: probe.videoCodec,
      audioCodec: probe.audioCodec,
      audioSampleRate: probe.audioSampleRate,
      audioChannels: probe.audioChannels,
      frameRate: probe.frameRate,
      duration: probe.duration,
    },
    {
      width: 1080,
      height: 1920,
      videoCodec: "h264",
      audioCodec: "aac",
      audioSampleRate: 48_000,
      audioChannels: 2,
      frameRate: 30,
      duration: 12,
    },
  );
  assert.deepEqual(video.musicExcerpt, musicExcerptForDate(plan.localDate));
  assert.ok(video.hash.length === 64);
  assert.match(video.binaries.ffmpegVersion, /^ffmpeg version/);
  assert.match(video.binaries.ffprobeVersion, /^ffprobe version/);
  const thumbnailMetadata = await sharp(video.thumbnail.file).metadata();
  assert.deepEqual(
    [
      thumbnailMetadata.width,
      thumbnailMetadata.height,
      thumbnailMetadata.format,
      thumbnailMetadata.space,
    ],
    [1080, 1920, "jpeg", "srgb"],
  );
  assert.equal(video.thumbnail.hash.length, 64);
  assert.equal(video.thumbnail.width, 1080);
  assert.equal(video.thumbnail.height, 1920);
  assert.equal(video.thumbnail.format, "jpeg");

  const brand = await loadBrand(frontendPublic);
  const repeated = await renderVideo({
    plan,
    brand,
    output: join(output, "repeat"),
  });
  assert.equal(repeated.hash, video.hash);
  assert.deepEqual(await readFile(repeated.file), await readFile(video.file));
  assert.equal(repeated.thumbnail.hash, video.thumbnail.hash);
  assert.deepEqual(
    await readFile(repeated.thumbnail.file),
    await readFile(video.thumbnail.file),
  );

  const selectedFrame = join(output, "selected-frame.png");
  await runProcess(video.binaries.ffmpegPath, [
    "-y",
    "-hide_banner",
    "-loglevel",
    "error",
    "-ss",
    "2",
    "-i",
    video.file,
    "-frames:v",
    "1",
    selectedFrame,
  ]);
  const thumbnailPixels = await sharp(video.thumbnail.file)
    .removeAlpha()
    .raw()
    .toBuffer();
  const selectedPixels = await sharp(selectedFrame)
    .removeAlpha()
    .raw()
    .toBuffer();
  assert.equal(selectedPixels.length, thumbnailPixels.length);
  let absoluteDifference = 0;
  for (let index = 0; index < selectedPixels.length; index += 1) {
    absoluteDifference += Math.abs(
      selectedPixels[index]! - thumbnailPixels[index]!,
    );
  }
  const meanDifference = absoluteDifference / selectedPixels.length;
  assert.ok(meanDifference < 18, `thumbnail mean difference ${meanDifference}`);
});

test("vertical scenes prioritize larger hook, values, answer, and CTA", async () => {
  const plan = createCampaign({
    localDate: "2026-08-27",
    publishTime: "12:17",
    history: [],
  });
  const brand = await loadBrand(frontendPublic);
  const hook = createVerticalSceneSvg({ plan, brand, scene: "hook" });
  const scenario = createVerticalSceneSvg({ plan, brand, scene: "scenario" });
  const answer = createVerticalSceneSvg({ plan, brand, scene: "answer" });
  const endCard = createVerticalSceneSvg({ plan, brand, scene: "end_card" });

  assert.equal(hook, createVerticalThumbnailSvg({ plan, brand }));
  assert.match(hook, />FAÇA A CONTA<\/text>/u);
  assert.match(hook, />DESCUBRA NO VÍDEO<\/text>/u);
  assert.doesNotMatch(hook, /01\/04/u);
  assert.match(scenario, /font-family="Figtree" font-size="72"[^>]*>R\$/u);
  assert.match(
    answer,
    /font-family="Stolzl" font-size="180"[^>]*><tspan[^>]*>R\$/u,
  );
  assert.match(
    endCard,
    /font-family="Stolzl" font-size="(?:[5-7][0-9])" font-weight="400"><tspan x="0"/u,
  );
  assert.match(
    endCard,
    /fill="#FEFDFB" font-family="Figtree" font-size="56" font-weight="700">/u,
  );
  assert.match(endCard, /<text x="0" y="[\d.]+"[^>]*>troco\.net<\/text>/u);
});

test("every vertical scene centers its complete stack inside safe bounds", async () => {
  const base = createCampaign({
    localDate: "2026-08-27",
    publishTime: "12:17",
    history: [],
  });
  const brand = await loadBrand(frontendPublic);
  const frame = safeAreaFor(1080, 1920);
  for (const plan of [
    base,
    { ...base, copy: { ...base.copy, explanation: "Confira o troco." } },
  ]) {
    for (const scene of ["hook", "scenario", "answer", "end_card"] as const) {
      const svg = createVerticalSceneSvg({ plan, brand, scene });
      assert.match(
        svg,
        /<g data-vertical-stack="true" transform="translate\(540 [\d.]+\)" text-anchor="middle">/u,
      );
      const layout = svgRenderer.verticalStackLayout(plan, scene);
      assert.ok(layout.safeTop >= frame.y);
      assert.ok(layout.safeBottom <= frame.bottom);
      assert.ok(layout.top >= layout.safeTop);
      assert.ok(layout.bottom <= layout.safeBottom);
      assert.equal(layout.bottom - layout.top, layout.height);
      assert.equal(
        (layout.top + layout.bottom) / 2,
        (layout.safeTop + layout.safeBottom) / 2,
      );
      assert.match(
        svg,
        new RegExp(`transform="translate\\(540 ${layout.top}\\)"`),
      );
      const stack = svg.slice(svg.indexOf('<g data-vertical-stack="true"'));
      assert.match(stack, />Troco<\/text>/u);
      if (scene !== "hook") assert.match(stack, />0[2-4]\/04<\/text>/u);
      for (const text of stack.matchAll(/<text\b[^>]*>/gu)) {
        if (text[0].includes('data-brand-word="true"')) continue;
        if (
          scene === "scenario" &&
          /text-anchor="(?:start|end)"/u.test(text[0])
        )
          continue;
        assert.match(text[0], /x="0"/u);
        assert.doesNotMatch(text[0], /text-anchor="(?:start|end)"/u);
      }
      for (const rect of stack.matchAll(
        /<rect x="(-?[\d.]+)"[^>]*width="([\d.]+)"/gu,
      )) {
        assert.equal(Number(rect[1]) + Number(rect[2]) / 2, 0);
      }
    }
  }
});

test("vertical treatments share canonical rounded web lockups across all scenes", async () => {
  const base = createCampaign({
    localDate: "2026-08-27",
    publishTime: "12:17",
    history: [],
  });
  const brand = await loadBrand(frontendPublic);
  for (const expected of verticalTreatments) {
    const id = Array.from(
      { length: 500 },
      (_, index) => `lockup-${index}`,
    ).find((candidate) => treatmentForCampaign(candidate).id === expected.id);
    assert.ok(id, `missing fixture for ${expected.id}`);
    const plan = { ...base, id } as CampaignPlan;
    for (const scene of ["hook", "scenario", "answer", "end_card"] as const) {
      const svg = createVerticalSceneSvg({ plan, brand, scene });
      assert.match(
        svg,
        new RegExp(
          `<rect width="1080" height="1920" fill="${expected.background}"/>`,
        ),
      );
      const word = svg.match(/<text\b[^>]*>Troco<\/text>/u)?.[0];
      assert.ok(word);
      assert.match(
        word,
        /font-family="Figtree" font-size="[\d.]+" font-weight="700" letter-spacing="-0.04em"/u,
      );
      assert.ok(word.includes(`fill="${expected.foreground}"`));
      const image = svg.match(/<image\b[^>]*>/u)?.[0];
      assert.ok(image);
      assert.ok(
        image.includes(
          Buffer.from(
            expected.inverse ? brand.inverseMarkSvg : brand.markSvg,
          ).toString("base64"),
        ),
      );
      const clipId = image.match(/clip-path="url\(#([^)]*)\)"/u)?.[1];
      assert.ok(clipId, "mark must use an actual clipping path");
      const clip = svg.match(
        new RegExp(`<clipPath id="${clipId}">(<rect[^>]*/>)</clipPath>`),
      )?.[1];
      assert.ok(clip);
      const size = Number(image.match(/width="([\d.]+)"/u)?.[1]);
      assert.equal(Number(clip.match(/rx="([\d.]+)"/u)?.[1]), size * 0.22);
      assert.equal(Number(clip.match(/width="([\d.]+)"/u)?.[1]), size);
      assert.equal(Number(clip.match(/height="([\d.]+)"/u)?.[1]), size);
      const wordWidth = Number(word.match(/textLength="([\d.]+)"/u)?.[1]);
      assert.ok(Number.isFinite(wordWidth), "word label needs exact SVG width");
      assert.equal(wordWidth, svgRenderer.VERTICAL_BRAND_WORD_WIDTH);
      assert.match(word, /lengthAdjust="spacingAndGlyphs"/u);
      const markLeft = Number(image.match(/x="(-?[\d.]+)"/u)?.[1]);
      const wordCenter = Number(word.match(/x="(-?[\d.]+)"/u)?.[1]);
      assert.equal((markLeft + wordCenter + wordWidth / 2) / 2, 0);
      assert.equal(
        wordCenter - wordWidth / 2 - (markLeft + size),
        size * (10 / 32),
      );
      assert.doesNotMatch(svg, /fill-opacity/u);
    }
  }
});

test("long fitting end cards remain inside platform overlay limits", () => {
  const base = createCampaign({
    localDate: "2026-08-27",
    publishTime: "12:17",
    history: [],
  });
  const plan = {
    ...base,
    copy: {
      ...base.copy,
      explanation: "Confira o troco. ".repeat(16),
      cta: "Treine seu troco agora. ".repeat(4),
    },
  };
  const layout = svgRenderer.verticalStackLayout(plan, "end_card");
  assert.equal(layout.safeTop, 250);
  assert.equal(layout.safeBottom, 1670);
  assert.ok(layout.top >= 250);
  assert.ok(layout.bottom <= 1670);
  assert.equal((layout.top + layout.bottom) / 2, 960);
});

test("individually fitting copy cannot escape the complete platform-safe stack", () => {
  const base = createCampaign({
    localDate: "2026-08-27",
    publishTime: "12:17",
    history: [],
  });
  const plan = {
    ...base,
    copy: {
      ...base.copy,
      explanation: "Confira o troco. ".repeat(21),
      cta: "Treine seu troco agora. ".repeat(4),
    },
  };
  assert.throws(
    () => svgRenderer.verticalStackLayout(plan, "end_card"),
    /Vertical scene end_card stack .* does not fit its safe area/u,
  );
});

test("oversized vertical copy reports the scene instead of clipping", () => {
  const base = createCampaign({
    localDate: "2026-08-27",
    publishTime: "12:17",
    history: [],
  });
  const plan = {
    ...base,
    copy: { ...base.copy, explanation: "Confira o troco. ".repeat(200) },
  };
  assert.equal(typeof svgRenderer.verticalStackLayout, "function");
  assert.throws(
    () => svgRenderer.verticalStackLayout(plan, "end_card"),
    /Vertical scene end_card.*(?:fit|safe area)/u,
  );
});
