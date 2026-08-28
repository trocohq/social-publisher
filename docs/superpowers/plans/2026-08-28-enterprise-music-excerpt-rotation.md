# Enterprise Music Excerpt Rotation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use
> superpowers:subagent-driven-development (recommended) or
> superpowers:executing-plans to implement this plan task-by-task. Steps use
> checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace procedural video audio with deterministic, date-rotated
12-second excerpts from the approved Enterprise MP3.

**Architecture:** Add one focused music module that owns the approved asset
contract, nine immutable excerpts, date selection, and FFprobe verification.
The video renderer consumes the selected excerpt directly from the MP3 through
an FFmpeg filter chain, while review contracts expose the excerpt metadata and
existing immutable campaign restoration remains unchanged.

**Tech Stack:** Node.js ESM, strict TypeScript, `node:test`, FFmpeg,
FFprobe, SHA-256, H.264/AAC, JSON dry-run manifests.

---

## File map

- Create `assets/music/enterprise.mp3`: approved source asset supplied by the
  project owner; never generated at runtime.
- Create `src/render/music.ts`: excerpt definitions, deterministic date
  selection, source path, digest contract, and source probing.
- Create `tests/music.test.ts`: pure rotation and real source validation tests.
- Modify `src/render/video.ts`: trim, attenuate, fade, limit, and encode the
  selected excerpt.
- Modify `src/render/probe.ts`: expose and enforce 48 kHz stereo output audio.
- Modify `tests/video-render.test.ts`: prove excerpt selection, encoded audio
  contract, and deterministic rendering.
- Modify `src/dry-run/create-review.ts`: expose excerpt metadata in HTML and
  JSON review output.
- Modify `tests/dry-run.test.ts`: verify the new review contract.
- Modify `tests/package-contract.test.ts`: ensure the approved source is part of
  the public package source tree.
- Delete `src/render/audio.ts`: remove procedural tone generation after all
  consumers use the approved source.
- Delete `tests/audio.test.ts`: remove the superseded procedural arrangement
  tests after the replacement contract is green.
- Modify `README.md`: replace procedural arrangement language with the
  Enterprise excerpt rotation.
- Modify `docs/operations.md`: add reviewer checks for excerpt ID, fades, and
  audio level.

### Task 1: Add the approved source and deterministic excerpt selector

**Files:**

- Create: `assets/music/enterprise.mp3`
- Create: `src/render/music.ts`
- Create: `tests/music.test.ts`
- Modify: `tests/package-contract.test.ts`

- [ ] **Step 1: Write the failing excerpt-rotation tests**

Create `tests/music.test.ts` with the pure contract first:

```ts
import assert from "node:assert/strict";
import test from "node:test";

import {
  enterpriseMusicExcerpts,
  musicExcerptForDate,
} from "../src/render/music.js";

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
```

- [ ] **Step 2: Run the selector tests and verify RED**

Run:

```bash
PATH=/Users/guilherme/.nvm/versions/node/v24.14.1/bin:$PATH node --import tsx --test tests/music.test.ts
```

Expected: FAIL because `src/render/music.ts` does not exist.

- [ ] **Step 3: Add the minimal pure selector**

Create `src/render/music.ts` with the immutable public types and selector:

```ts
import { fileURLToPath } from "node:url";

const MILLISECONDS_PER_DAY = 86_400_000;

export const ENTERPRISE_MUSIC_SHA256 =
  "d3884500099f06adc74583242056be7249f7758c4d1919efc6de3ccdf468029e";
export const enterpriseMusicPath = fileURLToPath(
  new URL("../../assets/music/enterprise.mp3", import.meta.url),
);

export type MusicExcerpt = Readonly<{
  id: string;
  startSeconds: number;
  durationSeconds: 12;
}>;

export const enterpriseMusicExcerpts: readonly MusicExcerpt[] = Object.freeze(
  [2, 16, 30, 44, 58, 72, 86, 100, 116].map((startSeconds, index) =>
    Object.freeze({
      id: `enterprise-${String(index + 1).padStart(2, "0")}`,
      startSeconds,
      durationSeconds: 12 as const,
    }),
  ),
);

function localDateOrdinal(localDate: string): number {
  if (!/^\d{4}-\d{2}-\d{2}$/u.test(localDate)) {
    throw new Error("Invalid local date");
  }
  const parsed = new Date(`${localDate}T00:00:00Z`);
  if (
    Number.isNaN(parsed.valueOf()) ||
    parsed.toISOString().slice(0, 10) !== localDate
  ) {
    throw new Error("Invalid local date");
  }
  return Math.floor(parsed.valueOf() / MILLISECONDS_PER_DAY);
}

export function musicExcerptForDate(localDate: string): MusicExcerpt {
  const ordinal = localDateOrdinal(localDate);
  const index =
    ((ordinal % enterpriseMusicExcerpts.length) +
      enterpriseMusicExcerpts.length) %
    enterpriseMusicExcerpts.length;
  return enterpriseMusicExcerpts[index]!;
}
```

- [ ] **Step 4: Run the selector tests and verify GREEN**

Run the command from Step 2.

Expected: 2 tests pass.

- [ ] **Step 5: Write failing source-integrity tests**

Extend `tests/music.test.ts` with real filesystem and media checks:

```ts
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { resolveMediaBinaries, runProcess } from "../src/render/binaries.js";
import {
  ENTERPRISE_MUSIC_SHA256,
  enterpriseMusicPath,
  verifyEnterpriseMusicSource,
  verifyMusicSource,
} from "../src/render/music.js";
import { sha256 } from "../src/shared/determinism.js";

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
```

Also add the package-source assertion to `tests/package-contract.test.ts`:

```ts
import { createHash } from "node:crypto";

test("the approved Enterprise music source is available to packaged renders", async () => {
  const bytes = await readFile(
    new URL("../assets/music/enterprise.mp3", import.meta.url),
  );
  assert.equal(
    createHash("sha256").update(bytes).digest("hex"),
    "d3884500099f06adc74583242056be7249f7758c4d1919efc6de3ccdf468029e",
  );
});
```

- [ ] **Step 6: Run the source tests and verify RED**

Run:

```bash
PATH=/Users/guilherme/.nvm/versions/node/v24.14.1/bin:$PATH node --import tsx --test tests/music.test.ts tests/package-contract.test.ts
```

Expected: FAIL because the approved MP3 and verification functions do not yet
exist.

- [ ] **Step 7: Copy the approved source asset**

Create the destination directory, then copy the user-provided source without
transcoding it:

```bash
mkdir -p assets/music
cp '/Users/guilherme/Downloads/Enterprise (No Copyright Music).mp3' assets/music/enterprise.mp3
shasum -a 256 assets/music/enterprise.mp3
```

Expected digest:

```text
d3884500099f06adc74583242056be7249f7758c4d1919efc6de3ccdf468029e
```

- [ ] **Step 8: Implement fail-closed source verification**

Extend `src/render/music.ts`:

```ts
import { readFile } from "node:fs/promises";

import { sha256 } from "../shared/determinism.js";
import { runProcess } from "./binaries.js";

export type MusicSourceProbe = Readonly<{
  durationSeconds: number;
  channels: number;
  sampleRate: number;
}>;

export async function verifyMusicSource({
  filePath,
  expectedSha256,
  minimumDurationSeconds,
  expectedChannels,
  expectedSampleRate,
  ffprobePath,
}: Readonly<{
  filePath: string;
  expectedSha256: string;
  minimumDurationSeconds: number;
  expectedChannels: number;
  expectedSampleRate: number;
  ffprobePath: string;
}>): Promise<MusicSourceProbe> {
  const bytes = await readFile(filePath).catch(() => {
    throw new Error("Approved music source is missing");
  });
  if (sha256(bytes) !== expectedSha256) {
    throw new Error("Approved music source digest mismatch");
  }

  const result = await runProcess(ffprobePath, [
    "-v",
    "error",
    "-show_entries",
    "stream=codec_type,sample_rate,channels:format=duration",
    "-of",
    "json",
    filePath,
  ]).catch((error: unknown) => {
    throw new Error("Approved music source could not be probed", {
      cause: error,
    });
  });
  const parsed = JSON.parse(result.stdout) as {
    streams?: readonly Readonly<{
      codec_type?: string;
      sample_rate?: string;
      channels?: number;
    }>[];
    format?: Readonly<{ duration?: string }>;
  };
  const audio = parsed.streams?.find((stream) => stream.codec_type === "audio");
  const probe = Object.freeze({
    durationSeconds: Number(parsed.format?.duration),
    channels: Number(audio?.channels),
    sampleRate: Number(audio?.sample_rate),
  });
  if (
    !Number.isFinite(probe.durationSeconds) ||
    probe.durationSeconds < minimumDurationSeconds
  ) {
    throw new Error("Approved music source duration is insufficient");
  }
  if (probe.channels !== expectedChannels) {
    throw new Error("Approved music source channel count is invalid");
  }
  if (probe.sampleRate !== expectedSampleRate) {
    throw new Error("Approved music source sample rate is invalid");
  }
  return probe;
}

export function verifyEnterpriseMusicSource(
  ffprobePath: string,
): Promise<MusicSourceProbe> {
  return verifyMusicSource({
    filePath: enterpriseMusicPath,
    expectedSha256: ENTERPRISE_MUSIC_SHA256,
    minimumDurationSeconds: 128,
    expectedChannels: 2,
    expectedSampleRate: 44_100,
    ffprobePath,
  });
}
```

- [ ] **Step 9: Run the complete music test file and verify GREEN**

Run the command from Step 6.

Expected: the four music tests and all package-contract tests pass, including
real FFprobe inspection and all fail-closed paths.

- [ ] **Step 10: Commit the source and selector**

```bash
git add assets/music/enterprise.mp3 src/render/music.ts tests/music.test.ts tests/package-contract.test.ts
git commit -m "feat: add approved enterprise music source"
```

### Task 2: Render the selected excerpt into every video

**Files:**

- Modify: `src/render/probe.ts`
- Modify: `src/render/video.ts`
- Modify: `src/dry-run/create-review.ts`
- Modify: `tests/video-render.test.ts`
- Modify: `tests/dry-run.test.ts`

- [ ] **Step 1: Write failing video audio-contract tests**

Replace the procedural imports and assertions in `tests/video-render.test.ts`:

```ts
import { readFile } from "node:fs/promises";

import { renderVideo } from "../src/render/video.js";
import { musicExcerptForDate } from "../src/render/music.js";

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

  const brand = await loadBrand(frontendPublic);
  const repeated = await renderVideo({
    plan,
    brand,
    output: join(output, "repeat"),
  });
  assert.equal(repeated.hash, video.hash);
  assert.deepEqual(await readFile(repeated.file), await readFile(video.file));
});
```

Replace the old `musicVariantForPalette` assertions in
`tests/dry-run.test.ts` at the same time:

```ts
import { musicExcerptForDate } from "../src/render/music.js";

const expectedExcerpt = musicExcerptForDate(review.plan.localDate);
assert.deepEqual(review.media.video.musicExcerpt, expectedExcerpt);
assert.deepEqual(manifest.video.musicExcerpt, expectedExcerpt);
assert.match(
  await readFile(join(output, "index.html"), "utf8"),
  new RegExp(`${expectedExcerpt.id}.*${expectedExcerpt.startSeconds}s`, "s"),
);
```

- [ ] **Step 2: Run the video tests and verify RED**

Run:

```bash
PATH=/Users/guilherme/.nvm/versions/node/v24.14.1/bin:$PATH node --import tsx --test tests/video-render.test.ts tests/dry-run.test.ts
```

Expected: FAIL because `VideoProbe` has no sample-rate/channel fields and the
renderer and review still return `musicVariant`.

- [ ] **Step 3: Extend the encoded video probe**

In `src/render/probe.ts`, add `sample_rate` and `channels` to `ProbeStream`, add
these properties to `VideoProbe`, populate them from the audio stream, and make
them part of the valid media contract:

```ts
type ProbeStream = Readonly<{
  codec_type?: string;
  codec_name?: string;
  width?: number;
  height?: number;
  avg_frame_rate?: string;
  r_frame_rate?: string;
  duration?: string;
  sample_rate?: string;
  channels?: number;
}>;

export type VideoProbe = Readonly<{
  width: number;
  height: number;
  videoCodec: string;
  audioCodec: string;
  audioSampleRate: number;
  audioChannels: number;
  frameRate: number;
  duration: number;
  bytes: number;
  format: string;
}>;

// Inside probeVideo:
audioSampleRate: Number(audio?.sample_rate),
audioChannels: Number(audio?.channels),

// Inside the valid expression:
probe.audioSampleRate === 48_000 &&
probe.audioChannels === 2 &&
probe.duration === 12 &&
```

- [ ] **Step 4: Replace procedural generation in the video renderer**

In `src/render/video.ts`, remove the `audio.ts` import and use:

```ts
import {
  enterpriseMusicPath,
  musicExcerptForDate,
  verifyEnterpriseMusicSource,
  type MusicExcerpt,
} from "./music.js";

export type RenderedVideo = Readonly<{
  file: string;
  hash: string;
  probe: VideoProbe;
  binaries: MediaBinaries;
  musicExcerpt: MusicExcerpt;
}>;
```

After resolving media binaries, select and verify the source:

```ts
const musicExcerpt = musicExcerptForDate(plan.localDate);
await verifyEnterpriseMusicSource(binaries.ffprobePath);
```

Remove `createToneBed` and its temporary WAV. After pushing the four scene
inputs, add the approved source directly:

```ts
args.push("-i", enterpriseMusicPath);
```

Build a single filter graph with the existing video concat and this audio
filter:

```ts
const audioInputIndex = sceneFiles.length;
const audioFilter =
  `[${audioInputIndex}:a:0]` +
  `atrim=start=${musicExcerpt.startSeconds}:duration=${musicExcerpt.durationSeconds},` +
  "asetpts=PTS-STARTPTS," +
  "volume=0.70," +
  "afade=t=in:st=0:d=0.35," +
  "afade=t=out:st=11.35:d=0.65," +
  "alimiter=limit=0.88:attack=5:release=50:level=false[a]";

args.push(
  "-filter_complex",
  `${videoFilters};${concatInputs}concat=n=${sceneFiles.length}:v=1:a=0[v];${audioFilter}`,
  "-map",
  "[v]",
  "-map",
  "[a]",
  "-c:v",
  "libx264",
  "-preset",
  "medium",
  "-crf",
  "20",
  "-pix_fmt",
  "yuv420p",
  "-r",
  "30",
  "-threads",
  "1",
  "-c:a",
  "aac",
  "-b:a",
  "128k",
  "-ar",
  "48000",
  "-ac",
  "2",
  "-t",
  String(TOTAL_SECONDS),
  "-movflags",
  "+faststart",
  "-metadata",
  `title=${plan.id}`,
  "-metadata",
  "creation_time=1970-01-01T00:00:00Z",
  "-metadata",
  "encoder=Troco Social Publisher",
  videoPath,
);
```

Return `musicExcerpt` instead of `musicVariant`.

- [ ] **Step 5: Update the review HTML and manifest**

In `src/dry-run/create-review.ts`, add this paragraph below the video probe
metadata:

```ts
<p>Música: <code>${escapeXml(video.musicExcerpt.id)}</code> · início ${video.musicExcerpt.startSeconds}s · duração ${video.musicExcerpt.durationSeconds}s</p>
```

Replace `musicVariant` in the manifest with:

```ts
musicExcerpt: video.musicExcerpt,
```

- [ ] **Step 6: Run music and video tests and verify GREEN**

Run:

```bash
PATH=/Users/guilherme/.nvm/versions/node/v24.14.1/bin:$PATH node --import tsx --test tests/music.test.ts tests/video-render.test.ts tests/dry-run.test.ts
```

Expected: all selection, source, encoded audio, and visual hierarchy tests pass.

- [ ] **Step 7: Commit the renderer migration**

```bash
git add src/render/probe.ts src/render/video.ts src/dry-run/create-review.ts tests/video-render.test.ts tests/dry-run.test.ts
git commit -m "feat: render deterministic enterprise excerpts"
```

### Task 3: Remove procedural audio and update operating documentation

**Files:**

- Modify: `tests/package-contract.test.ts`
- Modify: `README.md`
- Modify: `docs/operations.md`
- Delete: `src/render/audio.ts`
- Delete: `tests/audio.test.ts`

- [ ] **Step 1: Write a failing live-documentation contract test**

Extend the existing README contract in `tests/package-contract.test.ts`:

```ts
test("the README documents the approved Enterprise excerpt rotation", async () => {
  const readme = await readFile(
    new URL("../README.md", import.meta.url),
    "utf8",
  );
  assert.match(readme, /nine deterministic 12-second excerpts/u);
  assert.doesNotMatch(readme, /100 BPM arrangements/u);
});
```

- [ ] **Step 2: Run the documentation contract and verify RED**

Run:

```bash
PATH=/Users/guilherme/.nvm/versions/node/v24.14.1/bin:$PATH node --import tsx --test tests/package-contract.test.ts
```

Expected: FAIL because the README still documents procedural arrangements.

- [ ] **Step 3: Delete the superseded procedural implementation**

Delete `src/render/audio.ts` and `tests/audio.test.ts`. Confirm no live code
still imports `createToneBed`, `musicVariantForPalette`, or `musicVariants`:

```bash
rg -n "createToneBed|musicVariantForPalette|musicVariants|musicVariant" src tests
```

Expected: no matches.

- [ ] **Step 4: Update live documentation**

In `README.md`:

- replace “video with original generated audio” with “video with approved
  Enterprise music”;
- replace the paragraph about four 100 BPM arrangements with: “Every newly
  generated video uses one of nine deterministic 12-second excerpts from the
  approved Enterprise source. Consecutive dates use different excerpts, and the
  review manifest records the selected ID and start time.”;
- keep the official palette rotation documented independently of music.

In `docs/operations.md`, add to controlled activation review:

```text
Confirm that the manifest's Enterprise excerpt ID matches the video, the music
starts and ends with clean fades, the level is comfortable, and no clipping or
silence is audible before the final frame.
```

Document that changing `assets/music/enterprise.mp3` is a reviewed source
change that requires updating its approved digest and affects only future
campaigns.

- [ ] **Step 5: Run the documentation contract and full focused regression set**

Run:

```bash
PATH=/Users/guilherme/.nvm/versions/node/v24.14.1/bin:$PATH node --import tsx --test tests/music.test.ts tests/video-render.test.ts tests/dry-run.test.ts tests/package-contract.test.ts
```

Expected: all music, video, dry-run, and package-contract tests pass.

- [ ] **Step 6: Confirm the procedural contract is gone**

Run:

```bash
rg -n "procedural|100 BPM|musicVariant|musicVariants|createToneBed|brand-music\.wav" src tests README.md docs/operations.md
```

Expected: no matches in live source, tests, README, or operations documentation.
Historical specifications and plans are intentionally unchanged.

- [ ] **Step 7: Commit the review contract and documentation**

```bash
git add src/render/audio.ts tests/audio.test.ts tests/package-contract.test.ts README.md docs/operations.md
git commit -m "docs: expose enterprise excerpt rotation"
```

### Task 4: Verify media output and refresh the local review

**Files:**

- Generated only: `.tmp/enterprise-music-verification/**` (ignored)

- [ ] **Step 1: Format and run the full project checks**

Run:

```bash
PATH=/Users/guilherme/.nvm/versions/node/v24.14.1/bin:$PATH npm run format
PATH=/Users/guilherme/.nvm/versions/node/v24.14.1/bin:$PATH npm run check
```

Expected: formatting, TypeScript, and the complete test suite pass.

- [ ] **Step 2: Run the production validation gate**

Run:

```bash
PATH=/Users/guilherme/.nvm/versions/node/v24.14.1/bin:$PATH npm run validate
```

Expected: sanitized JSON containing `"ok":true`.

- [ ] **Step 3: Generate two consecutive review bundles**

Run:

```bash
PATH=/Users/guilherme/.nvm/versions/node/v24.14.1/bin:$PATH npm run dry-run -- --date 2026-08-28 --brand-root ../frontend/public --output .tmp/enterprise-music-verification/day-1
PATH=/Users/guilherme/.nvm/versions/node/v24.14.1/bin:$PATH npm run dry-run -- --date 2026-08-29 --brand-root ../frontend/public --output .tmp/enterprise-music-verification/day-2
```

Expected: both output bundles contain a 12-second video and their manifest
excerpt IDs differ.

- [ ] **Step 4: Verify excerpt rotation and encoded audio mechanically**

Run:

```bash
jq '.video.musicExcerpt' .tmp/enterprise-music-verification/day-1/manifest.json
jq '.video.musicExcerpt' .tmp/enterprise-music-verification/day-2/manifest.json
node_modules/ffprobe-static/bin/darwin/arm64/ffprobe -v error -show_entries stream=codec_name,sample_rate,channels:format=duration -of json .tmp/enterprise-music-verification/day-1/video/short.mp4
```

Expected: different excerpt IDs; H.264 plus 48 kHz stereo AAC; duration 12
seconds.

- [ ] **Step 5: Verify output loudness and peak**

Run:

```bash
node_modules/ffmpeg-static/ffmpeg -hide_banner -nostats -i .tmp/enterprise-music-verification/day-1/video/short.mp4 -filter_complex ebur128=peak=true -f null -
```

Expected: the measured true peak remains below 0 dBFS, the final fade reaches
silence at 12 seconds, and FFmpeg reports no decoding errors.

- [ ] **Step 6: Inspect and expose the local review**

Serve `.tmp/enterprise-music-verification/day-1` at the existing local review
URL, open it through the in-app browser with a cache-busting query parameter,
and inspect the beginning, middle, and end of the complete video. Confirm clean
fades, continuous music, correct excerpt metadata, and no visual regression.

- [ ] **Step 7: Confirm repository hygiene**

Run:

```bash
git diff --check
git status --short --branch
git log --oneline origin/main..HEAD
```

Expected: only the pre-existing untracked `.DS_Store` remains. The approved MP3
is tracked, generated review files stay ignored, and no state campaign or
credential file changed.
