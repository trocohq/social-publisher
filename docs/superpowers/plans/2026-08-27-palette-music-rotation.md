# Palette-Linked Music Rotation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Render each post with one official Troco background color and a matching deterministic arrangement of the same original musical identity.

**Architecture:** Keep palette as the single persisted audiovisual choice. A small exhaustive mapping converts the campaign palette into a named music variant, and the audio renderer applies variant configuration to the shared procedural composition. Video rendering passes the plan palette through this mapping; no provider, schedule, credential, or campaign-schema changes are needed.

**Tech Stack:** Node.js 24, TypeScript 6, Zod 4, Node test runner, procedural PCM WAV generation, FFmpeg H.264/AAC rendering

**Execution constraint:** Work directly on `main`, use micro-commits, do not push, and do not publish externally.

---

## File Structure

- Modify `src/render/audio.ts`: own the `MusicVariant` contract, exhaustive palette mapping, arrangement configuration, validation, and procedural synthesis.
- Modify `src/render/video.ts`: derive the variant from `plan.palette`, pass it to audio generation, and expose it in the immutable render result.
- Modify `src/dry-run/create-review.ts`: record the chosen arrangement in the local review manifest.
- Modify `tests/audio.test.ts`: verify mapping, determinism, distinct arrangements, stereo, pulse, RMS, peak, saturation, and invalid-variant rejection.
- Modify `tests/video-render.test.ts`: verify the rendered video reports the arrangement selected by its campaign palette.
- Modify `tests/dry-run.test.ts`: verify the review manifest records the arrangement.
- Modify `tests/create-campaign.test.ts`: exercise sequential campaign history and verify palette/pairing rotation.
- Modify `docs/superpowers/specs/2026-08-27-troco-palette-music-rotation-design.md`: mark the reviewed design implemented after verification.

### Task 1: Define the palette-to-music contract

**Files:**

- Modify: `tests/audio.test.ts`
- Modify: `src/render/audio.ts`

- [ ] **Step 1: Write the failing mapping test**

Add these imports and test to `tests/audio.test.ts`:

```ts
import {
  createToneBed,
  musicVariantForPalette,
  musicVariants,
} from "../src/render/audio.js";

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
```

- [ ] **Step 2: Run the mapping test and verify RED**

Run:

```bash
PATH=/Users/guilherme/.nvm/versions/node/v24.14.1/bin:$PATH node --import tsx --test --test-name-pattern="official palette" tests/audio.test.ts
```

Expected: FAIL because `musicVariantForPalette` and `musicVariants` are not exported.

- [ ] **Step 3: Add the exhaustive mapping**

Add to `src/render/audio.ts`:

```ts
import type { Palette } from "../editorial/schema.js";

export const musicVariants = ["warm", "airy", "bright", "pulse"] as const;
export type MusicVariant = (typeof musicVariants)[number];

const musicVariantByPalette = {
  green: "warm",
  blue: "airy",
  yellow: "bright",
  purple: "pulse",
} as const satisfies Readonly<Record<Palette, MusicVariant>>;

export function musicVariantForPalette(palette: Palette): MusicVariant {
  const variant = musicVariantByPalette[palette];
  if (!variant) throw new Error(`Unknown Troco palette: ${String(palette)}`);
  return variant;
}
```

- [ ] **Step 4: Run the focused test and typecheck**

Run:

```bash
PATH=/Users/guilherme/.nvm/versions/node/v24.14.1/bin:$PATH node --import tsx --test --test-name-pattern="official palette" tests/audio.test.ts
PATH=/Users/guilherme/.nvm/versions/node/v24.14.1/bin:$PATH npm run typecheck
```

Expected: mapping test PASS and typecheck PASS.

- [ ] **Step 5: Commit the contract**

```bash
git add src/render/audio.ts tests/audio.test.ts
git commit -m "feat: map Troco palettes to music variants"
```

### Task 2: Render four arrangements from one musical identity

**Files:**

- Modify: `tests/audio.test.ts`
- Modify: `src/render/audio.ts`

- [ ] **Step 1: Expand the audio test to cover every variant**

Replace the single-variant test setup with a loop that renders every variant
twice, and collect its digest:

```ts
import { createHash } from "node:crypto";

test("all music arrangements are distinct, deterministic, and safe", async () => {
  const output = await mkdtemp(join(tmpdir(), "troco-music-variants-"));
  const hashes = new Set<string>();

  for (const variant of musicVariants) {
    const first = await readFile(
      await createToneBed({
        filePath: join(output, `${variant}-first.wav`),
        durationSeconds: 12,
        cueTimes: [3, 6, 9],
        variant,
      }),
    );
    const second = await readFile(
      await createToneBed({
        filePath: join(output, `${variant}-second.wav`),
        durationSeconds: 12,
        cueTimes: [3, 6, 9],
        variant,
      }),
    );

    assert.deepEqual(first, second);
    assert.equal(first.readUInt16LE(22), 2);
    assert.equal(first.readUInt32LE(24), 48_000);
    assert.notEqual(rms(first, 2.4, 0.04, 0), rms(first, 2.4, 0.04, 1));
    assert.ok(rms(first, 2.4, 0.04, 0) > rms(first, 2.7, 0.04, 0) * 1.08);
    assert.ok(rms(first, 0.6, 10.8, 0) > 0.035);
    assert.ok(sampleStats(first).peak < 0.18);
    assert.equal(sampleStats(first).samplesAtCeiling, 0);
    hashes.add(createHash("sha256").update(first).digest("hex"));
  }

  assert.equal(hashes.size, musicVariants.length);
  await assert.rejects(
    createToneBed({
      filePath: join(output, "invalid.wav"),
      durationSeconds: 12,
      cueTimes: [3, 6, 9],
      variant: "unknown" as never,
    }),
    /Unknown music variant/,
  );
});
```

- [ ] **Step 2: Run the expanded test and verify RED**

Run:

```bash
PATH=/Users/guilherme/.nvm/versions/node/v24.14.1/bin:$PATH node --import tsx --test tests/audio.test.ts
```

Expected: FAIL because `createToneBed` does not accept or distinguish variants.

- [ ] **Step 3: Add shared arrangement configuration**

Define an `Arrangement` object in `src/render/audio.ts` with explicit gains for
pad, bass, kick, left/right pluck, left/right shaker, cue, harmonic brightness,
and master output. Create exhaustive `warm`, `airy`, `bright`, and `pulse`
entries. Change `createToneBed` to require `variant`, validate it at runtime, and
use the selected gains in the existing shared synthesis loop:

```ts
type Arrangement = Readonly<{
  master: number;
  pad: number;
  bass: number;
  kick: number;
  pluckLeft: number;
  pluckRight: number;
  shakerLeft: number;
  shakerRight: number;
  cue: number;
  harmonic: number;
}>;

const arrangements = {
  warm: {
    master: 1.75,
    pad: 1.16,
    bass: 1.08,
    kick: 0.92,
    pluckLeft: 0.54,
    pluckRight: 0.8,
    shakerLeft: 0.58,
    shakerRight: 0.76,
    cue: 0.9,
    harmonic: 0.18,
  },
  airy: {
    master: 1.9,
    pad: 1.28,
    bass: 0.76,
    kick: 0.74,
    pluckLeft: 0.5,
    pluckRight: 0.82,
    shakerLeft: 0.46,
    shakerRight: 0.72,
    cue: 1.08,
    harmonic: 0.34,
  },
  bright: {
    master: 1.66,
    pad: 0.88,
    bass: 0.9,
    kick: 1.12,
    pluckLeft: 0.74,
    pluckRight: 1.05,
    shakerLeft: 1.12,
    shakerRight: 1.34,
    cue: 1.18,
    harmonic: 0.42,
  },
  pulse: {
    master: 1.74,
    pad: 0.9,
    bass: 1.24,
    kick: 1.06,
    pluckLeft: 0.6,
    pluckRight: 0.92,
    shakerLeft: 0.9,
    shakerRight: 1.06,
    cue: 0.92,
    harmonic: 0.28,
  },
} as const satisfies Readonly<Record<MusicVariant, Arrangement>>;
```

Keep the existing chord progression, melody, 100 BPM timing, deterministic
noise, cue times, edge fade, and `softLimit`. Replace fixed voice multipliers
with the selected arrangement values. Validate the lookup before allocating the
sample buffer.

- [ ] **Step 4: Tune only within the declared safety envelope**

Run the audio test after each gain adjustment. Every variant must satisfy the
same pulse assertion, RMS above `0.035`, peak below `0.18`, and zero saturated
samples. Do not lower the safety assertions to accommodate a failing mix.

- [ ] **Step 5: Run focused tests and commit**

Run:

```bash
PATH=/Users/guilherme/.nvm/versions/node/v24.14.1/bin:$PATH node --import tsx --test tests/audio.test.ts
PATH=/Users/guilherme/.nvm/versions/node/v24.14.1/bin:$PATH npm run typecheck
git diff --check
```

Expected: all focused tests PASS, typecheck PASS, and no whitespace errors.

```bash
git add src/render/audio.ts tests/audio.test.ts
git commit -m "feat: arrange four Troco music variants"
```

### Task 3: Route campaign palette into video rendering

**Files:**

- Modify: `tests/video-render.test.ts`
- Modify: `tests/dry-run.test.ts`
- Modify: `src/render/video.ts`
- Modify: `src/dry-run/create-review.ts`

- [ ] **Step 1: Write the failing video-routing assertion**

Import `musicVariantForPalette` in `tests/video-render.test.ts`, change the
fixture destructuring to `const { plan, video }`, and add this assertion to the
real render test:

```ts
assert.equal(video.musicVariant, musicVariantForPalette(plan.palette));
```

In `tests/dry-run.test.ts`, parse `manifest.json` and assert that its
`video.musicVariant` equals `review.media.video.musicVariant`.

- [ ] **Step 2: Run the video test and verify RED**

Run:

```bash
PATH=/Users/guilherme/.nvm/versions/node/v24.14.1/bin:$PATH node --import tsx --test tests/video-render.test.ts
```

Expected: FAIL because `RenderedVideo` has no `musicVariant`.

- [ ] **Step 3: Pass and report the mapped variant**

Change `src/render/video.ts` as follows:

```ts
import {
  createToneBed,
  musicVariantForPalette,
  type MusicVariant,
} from "./audio.js";

export type RenderedVideo = Readonly<{
  file: string;
  hash: string;
  probe: VideoProbe;
  binaries: MediaBinaries;
  musicVariant: MusicVariant;
}>;
```

Inside `renderVideo`, derive `const musicVariant =
musicVariantForPalette(plan.palette)`, pass `variant: musicVariant` to
`createToneBed`, and include `musicVariant` in the frozen result.

In `src/dry-run/create-review.ts`, add this property to `manifest.video`:

```ts
musicVariant: video.musicVariant,
```

- [ ] **Step 4: Run video, dry-run, and type tests**

Run:

```bash
PATH=/Users/guilherme/.nvm/versions/node/v24.14.1/bin:$PATH node --import tsx --test tests/video-render.test.ts tests/dry-run.test.ts
PATH=/Users/guilherme/.nvm/versions/node/v24.14.1/bin:$PATH npm run typecheck
```

Expected: focused tests PASS and typecheck PASS.

- [ ] **Step 5: Commit routing**

```bash
git add src/render/video.ts src/dry-run/create-review.ts tests/video-render.test.ts tests/dry-run.test.ts
git commit -m "feat: pair video music with campaign palette"
```

### Task 4: Verify real sequential rotation

**Files:**

- Modify: `tests/create-campaign.test.ts`

- [ ] **Step 1: Write the sequential-history test**

Add a test that plans 28 consecutive days, feeds each result back through
`historyEntryFromCampaign`, and checks every adjacent palette:

```ts
test("sequential campaigns rotate every official palette without repeats", () => {
  const history: HistoryEntry[] = [];
  const observed = new Set<string>();
  const start = new Date("2026-09-01T12:00:00Z");

  for (let offset = 0; offset < 28; offset += 1) {
    const date = new Date(start);
    date.setUTCDate(start.getUTCDate() + offset);
    const plan = createCampaign({
      localDate: date.toISOString().slice(0, 10),
      publishTime: "12:17",
      history,
    });
    const previous = history.at(-1);
    assert.notEqual(plan.palette, previous?.palette);
    observed.add(plan.palette);
    history.push(historyEntryFromCampaign(plan));
  }

  assert.deepEqual([...observed].sort(), ["blue", "green", "purple", "yellow"]);
});
```

Update the imports in the same test file:

```ts
import {
  createCampaign,
  historyEntryFromCampaign,
} from "../src/planning/create-campaign.js";
import type { HistoryEntry } from "../src/editorial/select.js";
```

- [ ] **Step 2: Run the focused test**

Run:

```bash
PATH=/Users/guilherme/.nvm/versions/node/v24.14.1/bin:$PATH node --import tsx --test --test-name-pattern="sequential campaigns" tests/create-campaign.test.ts
```

Expected: PASS because the existing candidate selector already enforces the
palette rule when history is supplied. If it fails, diagnose the actual
selection history rather than weakening the assertion.

- [ ] **Step 3: Commit the regression coverage**

```bash
git add tests/create-campaign.test.ts
git commit -m "test: cover sequential audiovisual rotation"
```

### Task 5: Generate and inspect the four-palette review set

**Files:**

- Modify: `docs/superpowers/specs/2026-08-27-troco-palette-music-rotation-design.md`
- Generate only under ignored `.tmp/palette-music-review/`

- [ ] **Step 1: Generate one immutable plan per palette for review**

Use `createCampaign` for `2026-08-27`, replace only the palette through
`campaignPlanSchema.parse`, and call `renderFeed` plus `renderVideo` for each of
`green`, `blue`, `yellow`, and `purple`. Write outputs under
`.tmp/palette-music-review/<palette>/`; never add them to Git.

- [ ] **Step 2: Inspect every image and video**

Verify the canonical logo, official background token, text safe areas, 12-second
duration, expected arrangement name, stereo AAC at 48 kHz, and absence of NaN,
infinity, or denormal values. Listen for the shared motif and perceptible
arrangement difference.

- [ ] **Step 3: Run the complete verification suite**

Run:

```bash
PATH=/Users/guilherme/.nvm/versions/node/v24.14.1/bin:$PATH npm run check
PATH=/Users/guilherme/.nvm/versions/node/v24.14.1/bin:$PATH npm run validate
```

Expected: formatting, typecheck, all tests, media validation, and production
contract simulations PASS.

- [ ] **Step 4: Mark the design implemented**

Change the design status to:

```markdown
**Status:** Implemented and verified
```

- [ ] **Step 5: Commit documentation and inspect final state**

```bash
git add docs/superpowers/specs/2026-08-27-troco-palette-music-rotation-design.md
git commit -m "docs: record verified audiovisual rotation"
git status --short --branch
git log --oneline -10
```

Expected: `## main`, no tracked changes, review media ignored, micro-commits
present, and no push performed.
