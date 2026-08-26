import assert from "node:assert/strict";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { probeVideo } from "../src/render/probe.js";
import { renderFixtureCampaign } from "./support/render-fixture.js";

test("short output is a muted-safe H.264 AAC 1080 by 1920 MP4", async () => {
  const output = await mkdtemp(join(tmpdir(), "troco-short-"));
  const { video } = await renderFixtureCampaign(output);
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
});
