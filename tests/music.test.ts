import assert from "node:assert/strict";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

import { resolveMediaBinaries, runProcess } from "../src/render/binaries.js";
import {
  soundtrackForCampaign,
  verticalSoundtracks,
  verifyMusicSource,
  verifyVerticalSoundtrack,
} from "../src/render/music.js";
import { sha256 } from "../src/shared/determinism.js";

test("campaign IDs choose stable soundtracks across the approved catalog", () => {
  const alpha = soundtrackForCampaign("campaign-alpha");

  assert.deepEqual(soundtrackForCampaign("campaign-alpha"), alpha);
  assert.deepEqual(
    new Set(
      ["campaign-alpha", "campaign-beta"].map(
        (campaignId) => soundtrackForCampaign(campaignId).id,
      ),
    ),
    new Set(["funked-up", "funky-house"]),
  );
});

test("campaign soundtrack selection rejects blank campaign IDs", () => {
  assert.throws(() => soundtrackForCampaign(""), /campaign id.*empty/i);
  assert.throws(() => soundtrackForCampaign("   \t\n"), /campaign id.*empty/i);
});

test("the vertical soundtrack catalog has the two approved OpenGameArt sources", () => {
  assert.deepEqual(verticalSoundtracks, [
    {
      id: "funked-up",
      title: "Funked Up",
      artist: "Joth",
      license: "CC0-1.0",
      source: "https://opengameart.org/content/funked-up",
      filePath: fileURLToPath(
        new URL("../assets/music/funked-up.mp3", import.meta.url),
      ),
      sha256:
        "e2fa908a762add9ae8784832c14707525d7c7375cdd8c28217d0857967a79828",
      durationSeconds: 9,
    },
    {
      id: "funky-house",
      title: "Funky House",
      artist: "Of Far Different Nature",
      license: "CC0-1.0",
      source: "https://opengameart.org/content/funky-house",
      filePath: fileURLToPath(
        new URL("../assets/music/funky-house.mp3", import.meta.url),
      ),
      sha256:
        "1422a4630babedd49544dfa7d56399918841c86154d6f19ee61bbbc9f6693435",
      durationSeconds: 9,
    },
  ]);
});

test("vertical soundtracks satisfy their exact media contract", async () => {
  const binaries = await resolveMediaBinaries();

  for (const soundtrack of verticalSoundtracks) {
    const probe = await verifyVerticalSoundtrack(
      soundtrack,
      binaries.ffprobePath,
    );
    assert.ok(
      Math.abs(probe.durationSeconds - soundtrack.durationSeconds) <= 0.05,
    );
    assert.equal(probe.channels, 2);
    assert.equal(probe.sampleRate, 48_000);
  }
});

test("vertical soundtrack verification resolves ffprobe when no path is supplied", async () => {
  const probe = await verifyVerticalSoundtrack(verticalSoundtracks[0]!);

  assert.ok(
    Math.abs(probe.durationSeconds - verticalSoundtracks[0]!.durationSeconds) <=
      0.05,
  );
  assert.equal(probe.channels, 2);
  assert.equal(probe.sampleRate, 48_000);
});

test("music source verification fails closed", async () => {
  const root = await mkdtemp(join(tmpdir(), "troco-music-contract-"));
  const binaries = await resolveMediaBinaries();
  const changed = join(root, "changed.mp3");
  await writeFile(changed, "not the approved music");

  await assert.rejects(
    verifyMusicSource({
      filePath: join(root, "missing.mp3"),
      expectedSha256: verticalSoundtracks[0]!.sha256,
      exactDurationSeconds: 9,
      expectedChannels: 2,
      expectedSampleRate: 48_000,
      ffprobePath: binaries.ffprobePath,
    }),
    /music source is missing/i,
  );
  await assert.rejects(
    verifyMusicSource({
      filePath: changed,
      expectedSha256: verticalSoundtracks[0]!.sha256,
      exactDurationSeconds: 9,
      expectedChannels: 2,
      expectedSampleRate: 48_000,
      ffprobePath: binaries.ffprobePath,
    }),
    /digest mismatch/i,
  );

  const short = join(root, "short.wav");
  await runProcess(binaries.ffmpegPath, [
    "-y",
    "-hide_banner",
    "-loglevel",
    "error",
    "-f",
    "lavfi",
    "-i",
    "anullsrc=r=44100:cl=stereo",
    "-t",
    "1",
    short,
  ]);
  await assert.rejects(
    verifyMusicSource({
      filePath: short,
      expectedSha256: sha256(await readFile(short)),
      exactDurationSeconds: 9,
      expectedChannels: 2,
      expectedSampleRate: 48_000,
      ffprobePath: binaries.ffprobePath,
    }),
    /duration/i,
  );
  await assert.rejects(
    verifyMusicSource({
      filePath: verticalSoundtracks[0]!.filePath,
      expectedSha256: verticalSoundtracks[0]!.sha256,
      exactDurationSeconds: 9,
      expectedChannels: 1,
      expectedSampleRate: 48_000,
      ffprobePath: binaries.ffprobePath,
    }),
    /channel count/i,
  );
  await assert.rejects(
    verifyMusicSource({
      filePath: verticalSoundtracks[0]!.filePath,
      expectedSha256: verticalSoundtracks[0]!.sha256,
      exactDurationSeconds: 9,
      expectedChannels: 2,
      expectedSampleRate: 44_100,
      ffprobePath: binaries.ffprobePath,
    }),
    /sample rate/i,
  );
});

test("music source verification rejects maximum and exact duration mismatches", async () => {
  const binaries = await resolveMediaBinaries();
  const soundtrack = verticalSoundtracks[0]!;

  await assert.rejects(
    verifyMusicSource({
      filePath: soundtrack.filePath,
      expectedSha256: soundtrack.sha256,
      maximumDurationSeconds: 8,
      expectedChannels: 2,
      expectedSampleRate: 48_000,
      ffprobePath: binaries.ffprobePath,
    }),
    /duration exceeds the approved limit/i,
  );
  await assert.rejects(
    verifyMusicSource({
      filePath: soundtrack.filePath,
      expectedSha256: soundtrack.sha256,
      exactDurationSeconds: 8,
      expectedChannels: 2,
      expectedSampleRate: 48_000,
      ffprobePath: binaries.ffprobePath,
    }),
    /duration does not match the approved length/i,
  );
});
