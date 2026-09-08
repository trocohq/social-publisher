import assert from "node:assert/strict";
import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import sharp from "sharp";

import { probeVideo } from "../src/render/probe.js";
import { loadBrand } from "../src/brand/load-brand.js";
import { createCampaign } from "../src/planning/create-campaign.js";
import { runProcess } from "../src/render/binaries.js";
import { musicExcerptForDate } from "../src/render/music.js";
import {
  createVerticalSceneSvg,
  createVerticalThumbnailSvg,
} from "../src/render/svg.js";
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
  assert.match(scenario, /<rect x="30" y="670" width="1020" height="620"/u);
  assert.match(scenario, /font-family="Stolzl" font-size="72">R\$/u);
  assert.match(answer, /<rect x="30" y="980" width="1020" height="470"/u);
  assert.match(
    answer,
    /font-family="Stolzl" font-size="180"[^>]*aria-label="R\$/u,
  );
  assert.match(endCard, /<rect x="30" y="1280" width="1020" height="430"/u);
  assert.match(
    endCard,
    /font-family="Figtree" font-size="(?:[5-7][0-9])" font-weight="700" aria-label="/u,
  );
  assert.match(
    endCard,
    /fill="#FEFDFB" font-family="Figtree" font-size="56" font-weight="700"/u,
  );
  assert.match(endCard, /<text x="78" y="1640"[^>]*>troco\.net<\/text>/u);
});
