import assert from "node:assert/strict";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { probeVideo } from "../src/render/probe.js";
import { loadBrand } from "../src/brand/load-brand.js";
import { createCampaign } from "../src/planning/create-campaign.js";
import { musicVariantForPalette } from "../src/render/audio.js";
import { createVerticalSceneSvg } from "../src/render/svg.js";
import { canonicalBrandRoot } from "./support/brand-root.js";
import { renderFixtureCampaign } from "./support/render-fixture.js";

const frontendPublic = canonicalBrandRoot();

test("short output is a muted-safe H.264 AAC 1080 by 1920 MP4", async () => {
  const output = await mkdtemp(join(tmpdir(), "troco-short-"));
  const { plan, video } = await renderFixtureCampaign(output);
  const probe = await probeVideo(video.file);

  assert.deepEqual(
    {
      width: probe.width,
      height: probe.height,
      videoCodec: probe.videoCodec,
      audioCodec: probe.audioCodec,
      frameRate: probe.frameRate,
    },
    {
      width: 1080,
      height: 1920,
      videoCodec: "h264",
      audioCodec: "aac",
      frameRate: 30,
    },
  );
  assert.ok(probe.duration >= 8 && probe.duration <= 20);
  assert.ok(video.hash.length === 64);
  assert.match(video.binaries.ffmpegVersion, /^ffmpeg version/);
  assert.match(video.binaries.ffprobeVersion, /^ffprobe version/);
  assert.equal(video.musicVariant, musicVariantForPalette(plan.palette));
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
  const hookSize = Number(
    hook.match(/font-family="Stolzl" font-size="(\d+)"/)?.[1],
  );

  assert.ok(hookSize >= 112, `hook rendered at ${hookSize}px`);
  assert.match(scenario, /font-family="Stolzl" font-size="72">R\$/u);
  assert.match(
    answer,
    /font-family="Stolzl" font-size="180"[^>]*><tspan[^>]*>R\$/u,
  );
  assert.match(
    endCard,
    /fill="#FEFDFB" font-family="Figtree" font-size="56" font-weight="700">/u,
  );
});
