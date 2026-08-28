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
  verifyEnterpriseMusicSource,
  verifyMusicSource,
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
});
