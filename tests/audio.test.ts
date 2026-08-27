import assert from "node:assert/strict";
import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import {
  createToneBed,
  musicVariantForPalette,
  musicVariants,
} from "../src/render/audio.js";

function rms(
  wav: Buffer,
  startSeconds: number,
  durationSeconds: number,
  channel: 0 | 1,
): number {
  const sampleRate = wav.readUInt32LE(24);
  const channels = wav.readUInt16LE(22);
  const firstFrame = Math.floor(startSeconds * sampleRate);
  const frameCount = Math.floor(durationSeconds * sampleRate);
  let squareSum = 0;
  for (let frame = firstFrame; frame < firstFrame + frameCount; frame += 1) {
    const offset = 44 + (frame * channels + channel) * 2;
    const sample = wav.readInt16LE(offset) / 32_767;
    squareSum += sample * sample;
  }
  return Math.sqrt(squareSum / frameCount);
}

function sampleStats(wav: Buffer): Readonly<{
  peak: number;
  samplesAtCeiling: number;
}> {
  const ceiling = Math.round(0.18 * 32_767);
  let peak = 0;
  let samplesAtCeiling = 0;
  for (let offset = 44; offset < wav.length; offset += 2) {
    const sample = Math.abs(wav.readInt16LE(offset));
    peak = Math.max(peak, sample);
    if (sample >= ceiling) samplesAtCeiling += 1;
  }
  return { peak: peak / 32_767, samplesAtCeiling };
}

test("every official palette selects one stable music arrangement", () => {
  assert.deepEqual(musicVariants, ["warm", "airy", "bright", "pulse"]);
  assert.equal(musicVariantForPalette("green"), "warm");
  assert.equal(musicVariantForPalette("blue"), "airy");
  assert.equal(musicVariantForPalette("yellow"), "bright");
  assert.equal(musicVariantForPalette("purple"), "pulse");
  assert.throws(
    () => musicVariantForPalette("orange" as never),
    /Unknown Troco palette/,
  );
});

test("the original music bed is deterministic stereo with a clear 100 BPM pulse", async () => {
  const output = await mkdtemp(join(tmpdir(), "troco-music-"));
  const firstPath = await createToneBed({
    filePath: join(output, "first.wav"),
    durationSeconds: 12,
    cueTimes: [3, 6, 9],
  });
  const secondPath = await createToneBed({
    filePath: join(output, "second.wav"),
    durationSeconds: 12,
    cueTimes: [3, 6, 9],
  });
  const first = await readFile(firstPath);
  const second = await readFile(secondPath);

  assert.deepEqual(first, second);
  assert.equal(first.readUInt16LE(22), 2);
  assert.equal(first.readUInt32LE(24), 48_000);
  assert.notEqual(rms(first, 2.4, 0.04, 0), rms(first, 2.4, 0.04, 1));
  assert.ok(rms(first, 2.4, 0.04, 0) > rms(first, 2.7, 0.04, 0) * 1.08);
  assert.ok(rms(first, 0.6, 10.8, 0) > 0.04);
  assert.ok(sampleStats(first).peak < 0.18);
  assert.equal(sampleStats(first).samplesAtCeiling, 0);
});
