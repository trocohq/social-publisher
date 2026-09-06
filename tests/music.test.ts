import assert from "node:assert/strict";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { resolveMediaBinaries, runProcess } from "../src/render/binaries.js";
import {
  ENTERPRISE_MUSIC_SHA256,
  enterpriseMusicExcerpts,
  enterpriseMusicPath,
  musicExcerptForDate,
  soundtrackForCampaign,
  verticalSoundtracks,
  verifyEnterpriseMusicSource,
  verifyMusicSource,
  verifyVerticalSoundtrack,
} from "../src/render/music.js";
import { sha256 } from "../src/shared/determinism.js";

test("Enterprise excerpts cover nine distinct twelve-second windows", () => {
  assert.equal(enterpriseMusicExcerpts.length, 9);
  assert.deepEqual(
    enterpriseMusicExcerpts.map(({ id, startSeconds, durationSeconds }) => ({
      id,
      startSeconds,
      durationSeconds,
    })),
    [2, 16, 30, 44, 58, 72, 86, 100, 116].map((startSeconds, index) => ({
      id: `enterprise-${String(index + 1).padStart(2, "0")}`,
      startSeconds,
      durationSeconds: 12,
    })),
  );
});

test("campaign dates rotate Enterprise excerpts deterministically", () => {
  const first = musicExcerptForDate("1970-01-01");
  assert.equal(first.id, "enterprise-01");
  assert.deepEqual(musicExcerptForDate("1970-01-01"), first);
  assert.equal(musicExcerptForDate("1970-01-02").id, "enterprise-02");
  assert.equal(musicExcerptForDate("1970-01-09").id, "enterprise-09");
  assert.equal(musicExcerptForDate("1970-01-10").id, "enterprise-01");
  assert.throws(() => musicExcerptForDate("2026-02-30"), /Invalid local date/);
  assert.throws(() => musicExcerptForDate("not-a-date"), /Invalid local date/);
});

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
      filePath: new URL("../assets/music/funked-up.mp3", import.meta.url)
        .pathname,
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
      filePath: new URL("../assets/music/funky-house.mp3", import.meta.url)
        .pathname,
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

test("the approved Enterprise source matches its committed contract", async () => {
  const binaries = await resolveMediaBinaries();
  const probe = await verifyEnterpriseMusicSource(binaries.ffprobePath);

  assert.equal(
    sha256(await readFile(enterpriseMusicPath)),
    ENTERPRISE_MUSIC_SHA256,
  );
  assert.equal(probe.channels, 2);
  assert.equal(probe.sampleRate, 44_100);
  assert.ok(probe.durationSeconds >= 128);
});

test("music source verification fails closed", async () => {
  const root = await mkdtemp(join(tmpdir(), "troco-music-contract-"));
  const binaries = await resolveMediaBinaries();
  const changed = join(root, "changed.mp3");
  await writeFile(changed, "not the approved music");

  await assert.rejects(
    verifyMusicSource({
      filePath: join(root, "missing.mp3"),
      expectedSha256: ENTERPRISE_MUSIC_SHA256,
      minimumDurationSeconds: 128,
      expectedChannels: 2,
      expectedSampleRate: 44_100,
      ffprobePath: binaries.ffprobePath,
    }),
    /music source is missing/i,
  );
  await assert.rejects(
    verifyMusicSource({
      filePath: changed,
      expectedSha256: ENTERPRISE_MUSIC_SHA256,
      minimumDurationSeconds: 128,
      expectedChannels: 2,
      expectedSampleRate: 44_100,
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
      minimumDurationSeconds: 128,
      expectedChannels: 2,
      expectedSampleRate: 44_100,
      ffprobePath: binaries.ffprobePath,
    }),
    /duration/i,
  );
  await assert.rejects(
    verifyMusicSource({
      filePath: enterpriseMusicPath,
      expectedSha256: ENTERPRISE_MUSIC_SHA256,
      minimumDurationSeconds: 128,
      expectedChannels: 1,
      expectedSampleRate: 44_100,
      ffprobePath: binaries.ffprobePath,
    }),
    /channel count/i,
  );
  await assert.rejects(
    verifyMusicSource({
      filePath: enterpriseMusicPath,
      expectedSha256: ENTERPRISE_MUSIC_SHA256,
      minimumDurationSeconds: 128,
      expectedChannels: 2,
      expectedSampleRate: 48_000,
      ffprobePath: binaries.ffprobePath,
    }),
    /sample rate/i,
  );
});
