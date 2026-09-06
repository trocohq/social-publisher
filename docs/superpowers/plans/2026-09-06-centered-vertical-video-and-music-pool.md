# Centered Vertical Video and Music Pool Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Produce deterministic, centered, color-varied 1080×1920 Troco videos for Instagram Reels and TikTok with one of two approved Openings soundtracks.

**Architecture:** Keep the existing shared `short.mp4` pipeline and isolate two new deterministic decisions behind focused render modules: a soundtrack catalog and a vertical color-treatment catalog. The SVG renderer consumes one treatment per campaign and emits scene-local centered stacks; the video renderer loops the selected 9-second source to the existing 12-second duration. Feed rendering and publishing adapters remain untouched.

**Tech Stack:** Node.js 20+, strict TypeScript, SVG, Sharp, FFmpeg/FFprobe, Node test runner, `@trocohq/design-tokens`.

---

### Task 1: Bundle and verify the approved music sources

**Files:**

- Create: `assets/music/funked-up.mp3`
- Create: `assets/music/funky-house.mp3`
- Create: `assets/music/README.md`
- Modify: `tests/package-contract.test.ts`

- [ ] **Step 1: Replace the Enterprise package-contract test with failing two-track assertions**

```ts
test("the approved Openings music sources are available to packaged renders", async () => {
  const expected = new Map([
    [
      "funked-up.mp3",
      "e2fa908a762add9ae8784832c14707525d7c7375cdd8c28217d0857967a79828",
    ],
    [
      "funky-house.mp3",
      "1422a4630babedd49544dfa7d56399918841c86154d6f19ee61bbbc9f6693435",
    ],
  ]);

  for (const [filename, digest] of expected) {
    const bytes = await readFile(
      new URL(`../assets/music/${filename}`, import.meta.url),
    );
    assert.equal(createHash("sha256").update(bytes).digest("hex"), digest);
  }
});
```

- [ ] **Step 2: Run the package test and verify it fails**

Run: `node --import tsx --test tests/package-contract.test.ts`

Expected: FAIL because `assets/music/funked-up.mp3` and `funky-house.mp3` do not exist.

- [ ] **Step 3: Copy the reviewed sources and add attribution**

Copy byte-for-byte:

```text
../../openings.dev/social-publisher/assets/audio/funked-up.mp3 -> assets/music/funked-up.mp3
../../openings.dev/social-publisher/assets/audio/funky-house.mp3 -> assets/music/funky-house.mp3
```

Create `assets/music/README.md`:

```markdown
# Approved music

- `funked-up.mp3`: “Funked Up” by Joth, CC0 1.0, https://opengameart.org/content/funked-up
- `funky-house.mp3`: “Funky House” by Of Far Different Nature, CC0 1.0, https://opengameart.org/content/funky-house

These files are integrity-checked by `src/render/music.ts`. Do not replace them without updating the reviewed hashes and tests.
```

- [ ] **Step 4: Run the package test and verify it passes**

Run: `node --import tsx --test tests/package-contract.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit the bundled sources**

```bash
git add assets/music/funked-up.mp3 assets/music/funky-house.mp3 assets/music/README.md tests/package-contract.test.ts
git commit -m "feat: bundle approved vertical video soundtracks"
```

### Task 2: Select and validate a deterministic soundtrack

**Files:**

- Modify: `src/render/music.ts`
- Create: `tests/music.test.ts`

- [ ] **Step 1: Write failing catalog and selection tests**

```ts
import assert from "node:assert/strict";
import test from "node:test";

import {
  soundtrackForCampaign,
  verticalSoundtracks,
  verifyVerticalSoundtrack,
} from "../src/render/music.js";

test("soundtrack selection is stable and reaches both approved tracks", () => {
  const ids = Array.from(
    { length: 40 },
    (_, index) =>
      `2026-09-${String(index + 1).padStart(2, "0")}-quick-calculation-v1-0`,
  );
  const selected = ids.map((id) => soundtrackForCampaign(id));
  assert.deepEqual(
    selected.map((track, index) => soundtrackForCampaign(ids[index]!).id),
    selected.map((track) => track.id),
  );
  assert.deepEqual(
    new Set(selected.map((track) => track.id)),
    new Set(["funked-up", "funky-house"]),
  );
});

test("the approved sources are exact nine-second 48 kHz stereo tracks", async () => {
  for (const track of verticalSoundtracks) {
    assert.deepEqual(await verifyVerticalSoundtrack(track), {
      durationSeconds: 9,
      channels: 2,
      sampleRate: 48_000,
    });
  }
});
```

- [ ] **Step 2: Run the music tests and verify they fail**

Run: `node --import tsx --test tests/music.test.ts`

Expected: FAIL because the soundtrack exports do not exist.

- [ ] **Step 3: Replace the Enterprise excerpt catalog with the two-track catalog**

Implement these public contracts in `src/render/music.ts`, retaining the generic `verifyMusicSource` helper:

```ts
import { chooseSeeded, sha256 } from "../shared/determinism.js";

export type VerticalSoundtrack = Readonly<{
  id: "funked-up" | "funky-house";
  title: string;
  artist: string;
  license: "CC0-1.0";
  source: string;
  filePath: string;
  sha256: string;
  durationSeconds: 9;
}>;

export const verticalSoundtracks: readonly VerticalSoundtrack[] = Object.freeze(
  [
    Object.freeze({
      id: "funked-up",
      title: "Funked Up",
      artist: "Joth",
      license: "CC0-1.0",
      source: "https://opengameart.org/content/funked-up",
      filePath: fileURLToPath(
        new URL("../../assets/music/funked-up.mp3", import.meta.url),
      ),
      sha256:
        "e2fa908a762add9ae8784832c14707525d7c7375cdd8c28217d0857967a79828",
      durationSeconds: 9,
    }),
    Object.freeze({
      id: "funky-house",
      title: "Funky House",
      artist: "Of Far Different Nature",
      license: "CC0-1.0",
      source: "https://opengameart.org/content/funky-house",
      filePath: fileURLToPath(
        new URL("../../assets/music/funky-house.mp3", import.meta.url),
      ),
      sha256:
        "1422a4630babedd49544dfa7d56399918841c86154d6f19ee61bbbc9f6693435",
      durationSeconds: 9,
    }),
  ],
);

export function soundtrackForCampaign(campaignId: string): VerticalSoundtrack {
  if (!campaignId.trim())
    throw new Error("Campaign ID is required for soundtrack selection");
  return chooseSeeded(verticalSoundtracks, campaignId, 41);
}

export function verifyVerticalSoundtrack(
  track: VerticalSoundtrack,
  ffprobePath?: string,
): Promise<MusicSourceProbe> {
  return resolveMediaBinaries(ffprobePath ? { ffprobePath } : {}).then(
    (binaries) =>
      verifyMusicSource({
        filePath: track.filePath,
        expectedSha256: track.sha256,
        minimumDurationSeconds: track.durationSeconds,
        maximumDurationSeconds: track.durationSeconds,
        expectedChannels: 2,
        expectedSampleRate: 48_000,
        ffprobePath: binaries.ffprobePath,
      }),
  );
}
```

Extend `verifyMusicSource` with `maximumDurationSeconds?: number` and reject a probe outside the inclusive duration bounds. Remove `enterpriseMusicPath`, `enterpriseMusicExcerpts`, `musicExcerptForDate`, and `verifyEnterpriseMusicSource` after consumers move in Task 5.

- [ ] **Step 4: Run the music tests and typecheck**

Run: `node --import tsx --test tests/music.test.ts && npm run typecheck`

Expected: PASS.

- [ ] **Step 5: Commit soundtrack selection**

```bash
git add src/render/music.ts tests/music.test.ts
git commit -m "feat: select deterministic campaign soundtracks"
```

### Task 3: Select a deterministic vertical color treatment

**Files:**

- Create: `src/render/vertical-treatment.ts`
- Create: `tests/vertical-treatment.test.ts`

- [ ] **Step 1: Write failing treatment tests**

```ts
import assert from "node:assert/strict";
import test from "node:test";

import {
  treatmentForCampaign,
  verticalTreatments,
} from "../src/render/vertical-treatment.js";

test("vertical treatments use the seven official backgrounds", () => {
  assert.deepEqual(
    verticalTreatments.map((item) => item.id),
    ["paper", "ink", "primary", "purple", "yellow", "blue", "coral"],
  );
});

test("treatment selection is stable and reaches every treatment", () => {
  const ids = Array.from({ length: 400 }, (_, index) => `campaign-${index}`);
  assert.equal(treatmentForCampaign(ids[0]!), treatmentForCampaign(ids[0]!));
  assert.deepEqual(
    new Set(ids.map((id) => treatmentForCampaign(id).id)),
    new Set(verticalTreatments.map((item) => item.id)),
  );
});

test("only the Ink treatment uses inverse foreground assets", () => {
  for (const treatment of verticalTreatments) {
    assert.equal(treatment.inverse, treatment.id === "ink");
  }
});
```

- [ ] **Step 2: Run the treatment tests and verify they fail**

Run: `node --import tsx --test tests/vertical-treatment.test.ts`

Expected: FAIL because the module does not exist.

- [ ] **Step 3: Implement the treatment catalog**

```ts
import { designTokens } from "@trocohq/design-tokens";
import { chooseSeeded } from "../shared/determinism.js";

export type VerticalTreatment = Readonly<{
  id: "paper" | "ink" | "primary" | "purple" | "yellow" | "blue" | "coral";
  background: string;
  foreground: string;
  surface: string;
  surfaceForeground: string;
  inverse: boolean;
}>;

const light = (
  id: VerticalTreatment["id"],
  background: string,
): VerticalTreatment =>
  Object.freeze({
    id,
    background,
    foreground: designTokens.colors.ink,
    surface: designTokens.colors.paper,
    surfaceForeground: designTokens.colors.ink,
    inverse: false,
  });

export const verticalTreatments: readonly VerticalTreatment[] = Object.freeze([
  light("paper", designTokens.colors.paper),
  Object.freeze({
    id: "ink",
    background: designTokens.colors.ink,
    foreground: designTokens.colors.paper,
    surface: designTokens.colors.paper,
    surfaceForeground: designTokens.colors.ink,
    inverse: true,
  }),
  light("primary", designTokens.colors.primary),
  light("purple", designTokens.colors.purple),
  light("yellow", designTokens.colors.yellow),
  light("blue", designTokens.colors.blue),
  light("coral", designTokens.colors.coral),
]);

export function treatmentForCampaign(campaignId: string): VerticalTreatment {
  if (!campaignId.trim())
    throw new Error("Campaign ID is required for color selection");
  return chooseSeeded(verticalTreatments, campaignId, 43);
}
```

- [ ] **Step 4: Run the treatment tests and typecheck**

Run: `node --import tsx --test tests/vertical-treatment.test.ts && npm run typecheck`

Expected: PASS.

- [ ] **Step 5: Commit color treatment selection**

```bash
git add src/render/vertical-treatment.ts tests/vertical-treatment.test.ts
git commit -m "feat: add vertical campaign color treatments"
```

### Task 4: Render centered scene stacks and the canonical web lockup

**Files:**

- Modify: `src/render/svg.ts`
- Modify: `tests/thumbnail.test.ts`
- Modify: `tests/video-render.test.ts`

- [ ] **Step 1: Replace coordinate-specific assertions with failing layout-contract tests**

Add assertions that every vertical SVG:

```ts
const scenes = ["hook", "scenario", "answer", "end_card"] as const;
for (const scene of scenes) {
  const svg = createVerticalSceneSvg({ plan, brand, scene });
  assert.match(svg, /data-vertical-stack="true"/u);
  assert.match(svg, /transform="translate\(540 [0-9]+\)"/u);
  assert.match(svg, /text-anchor="middle"/u);
  assert.match(
    svg,
    /font-family="Figtree"[^>]*font-weight="700"[^>]*letter-spacing="-0\.04em"[^>]*>Troco<\/text>/u,
  );
  assert.match(svg, /rx="22%"/u);
}
```

Add layout-bound assertions using a new exported helper:

```ts
for (const scene of scenes) {
  const layout = verticalStackLayout(plan, scene);
  assert.ok(layout.top >= layout.safeTop);
  assert.ok(layout.bottom <= layout.safeBottom);
  assert.equal(layout.top + layout.bottom, layout.safeTop + layout.safeBottom);
}
```

Add treatment assertions for one ID resolving to `ink` and one resolving to a light treatment: the dark SVG must embed `brand.inverseMarkSvg` and Paper foreground, while the light SVG embeds `brand.markSvg` and Ink foreground. Determine the fixture IDs in the test by scanning candidates through `treatmentForCampaign`, not by hard-coding hash outcomes.

- [ ] **Step 2: Run the focused SVG tests and verify they fail**

Run: `node --import tsx --test tests/thumbnail.test.ts tests/video-render.test.ts`

Expected: FAIL because centered stack metadata, web lockup, and treatment-aware marks are absent.

- [ ] **Step 3: Add centered text and stack geometry helpers**

In `src/render/svg.ts`, extend `textBlock` with an optional anchor and add:

```ts
export type VerticalStackLayout = Readonly<{
  top: number;
  bottom: number;
  safeTop: number;
  safeBottom: number;
  height: number;
}>;

function centeredTextBlock(
  layout: TextLayout,
  top: number,
  font: "Stolzl" | "Figtree",
  weight = 400,
  fill = designTokens.colors.ink,
): string {
  return textBlock(layout, 0, top, font, weight, fill, "middle");
}

export function verticalStackLayout(
  plan: Pick<CampaignPlan, "copy" | "scenario">,
  scene: VerticalScene,
): VerticalStackLayout {
  const safeTop = Math.max(VERTICAL_FRAME.y, 250);
  const safeBottom = Math.min(VERTICAL_FRAME.bottom, 1670);
  const height = measuredVerticalStackHeight(plan, scene);
  if (height > safeBottom - safeTop) {
    throw new Error(`Vertical ${scene} stack escapes the platform safe area`);
  }
  const top = safeTop + Math.floor((safeBottom - safeTop - height) / 2);
  return Object.freeze({
    top,
    bottom: top + height,
    safeTop,
    safeBottom,
    height,
  });
}
```

Implement `measuredVerticalStackHeight` from the actual fitted text heights plus named constants for lockup, gaps, cards, CTA, and progress. Do not retain absolute scene Y coordinates.

- [ ] **Step 4: Render the official centered lockup and scene-local groups**

Select `treatmentForCampaign(plan.id)` once per SVG. Render each scene as:

```xml
<g data-vertical-stack="true" transform="translate(540 STACK_TOP)" text-anchor="middle">
  <!-- mark and “Troco” lockup, headline, scene card/CTA, and progress -->
</g>
```

For the lockup, choose `brand.inverseMarkSvg` only when `treatment.inverse` is true, calculate the combined icon/word width so the pair is centered as a unit, render the mark with `rx="22%"`, and render `Troco` in Figtree 700 with `letter-spacing="-0.04em"`. Use `x=0` for centered headlines and symmetric `x=-width/2` card/CTA rectangles. Keep value-row labels and amounts internally legible while centering their card container.

- [ ] **Step 5: Run focused SVG and feed regression tests**

Run: `node --import tsx --test tests/thumbnail.test.ts tests/video-render.test.ts tests/image-render.test.ts`

Expected: PASS, including unchanged feed snapshots/contracts.

- [ ] **Step 6: Commit centered vertical rendering**

```bash
git add src/render/svg.ts tests/thumbnail.test.ts tests/video-render.test.ts
git commit -m "feat: center branded vertical video scenes"
```

### Task 5: Integrate looped soundtrack selection into video rendering

**Files:**

- Modify: `src/render/video.ts`
- Modify: `src/dry-run/create-review.ts`
- Modify: `tests/video-render.test.ts`
- Modify: `tests/dry-run.test.ts`

- [ ] **Step 1: Write failing render-result and FFmpeg contract tests**

Update video expectations to compare `video.soundtrack` with `soundtrackForCampaign(plan.id)`. Assert the reported ID, title, artist, and license appear in dry-run HTML. Extract `buildVideoFfmpegArguments` from `renderVideo` and assert the audio input begins with:

```ts
assert.deepEqual(
  args.slice(args.indexOf("-stream_loop"), args.indexOf("-stream_loop") + 4),
  ["-stream_loop", "-1", "-i", soundtrack.filePath],
);
assert.match(
  args[args.indexOf("-filter_complex") + 1]!,
  /atrim=start=0:duration=12/u,
);
```

- [ ] **Step 2: Run video and dry-run tests and verify they fail**

Run: `node --import tsx --test tests/video-render.test.ts tests/dry-run.test.ts`

Expected: FAIL because the renderer still uses the Enterprise date excerpt.

- [ ] **Step 3: Select, verify, loop, and report the campaign soundtrack**

In `renderVideo`, replace the Enterprise calls with:

```ts
const soundtrack = soundtrackForCampaign(plan.id);
await verifyVerticalSoundtrack(soundtrack, binaries.ffprobePath);
```

Pass the audio input as `-stream_loop`, `-1`, `-i`, `soundtrack.filePath`. Change the audio filter to start at zero and trim to `TOTAL_SECONDS`, retaining volume, fades, limiter, AAC, stereo, and 48 kHz settings. Rename the result property from `musicExcerpt` to `soundtrack` and expose the public metadata without duplicating the file bytes. Update dry-run copy to show title, artist, and license.

- [ ] **Step 4: Run focused render and dry-run tests**

Run: `node --import tsx --test tests/music.test.ts tests/video-render.test.ts tests/dry-run.test.ts`

Expected: PASS; probe duration remains exactly 12 seconds.

- [ ] **Step 5: Commit video integration**

```bash
git add src/render/video.ts src/dry-run/create-review.ts tests/video-render.test.ts tests/dry-run.test.ts
git commit -m "feat: render vertical videos with campaign soundtracks"
```

### Task 6: Update validation and operator documentation

**Files:**

- Modify: `src/validation/run.ts`
- Modify: `README.md`
- Modify: `docs/operations.md`
- Modify: `tests/package-contract.test.ts`

- [ ] **Step 1: Write failing documentation and validation assertions**

Replace Enterprise-specific README checks with phrases that require documentation of:

```ts
for (const phrase of [
  "Funked Up",
  "Funky House",
  "campaign ID",
  "seven official background treatments",
  "centered within the vertical safe area",
  "22% corner radius",
]) {
  assert.ok(
    `${readme}\n${operations}`.includes(phrase),
    `Missing documentation: ${phrase}`,
  );
}
```

Extend validation to assert two source files, exact approved digests, 9-second probes, both selectable soundtrack IDs, seven selectable color treatments, and centered stack bounds for every fixture scene.

- [ ] **Step 2: Run package tests and validation and verify they fail**

Run: `node --import tsx --test tests/package-contract.test.ts && npm run validate`

Expected: FAIL on stale Enterprise documentation and missing new validation coverage.

- [ ] **Step 3: Update README, operations, and validation**

Document the deterministic two-track selection, 9-to-12-second looping, seven official treatments, canonical web lockup, automatic normal/inverse mark selection, centered safe-area stack, and unchanged feed behavior. Replace validation imports and checks that refer to Enterprise excerpts.

- [ ] **Step 4: Run package tests and validation**

Run: `node --import tsx --test tests/package-contract.test.ts && npm run validate`

Expected: PASS.

- [ ] **Step 5: Commit operational contracts**

```bash
git add src/validation/run.ts README.md docs/operations.md tests/package-contract.test.ts
git commit -m "docs: describe centered vertical campaign variants"
```

### Task 7: Run the complete verification and visual review

**Files:**

- Modify only if verification exposes a defect in an already listed implementation file.

- [ ] **Step 1: Format the implementation**

Run: `npm run format`

Expected: Prettier completes without errors.

- [ ] **Step 2: Run the full quality gate**

Run: `npm run check`

Expected: formatting, typecheck, and all tests PASS.

- [ ] **Step 3: Run the full domain validation**

Run: `npm run validate`

Expected: catalog, brand, render, media, state, and workflow validation PASS.

- [ ] **Step 4: Generate representative review media**

Run dry runs for enough dates/campaign IDs to cover both soundtrack IDs, all seven treatments, and every campaign family. Use an output directory outside Git, then inspect each generated HTML review and `short.mp4`.

Expected: all four scenes remain centered within overlay-safe bounds; the same treatment persists across a video; Paper/Ink mark switching is correct; Figtree and Stolzl match the web; audio fills all 12 seconds and fades cleanly.

- [ ] **Step 5: Verify the final diff is scoped**

Run: `git status --short && git diff --check && git diff HEAD~6 --stat`

Expected: only planned render, test, documentation, and two approved audio files changed; no generated JPEG, MP4, WAV, HTML review output, or credentials are tracked.

- [ ] **Step 6: Commit formatting-only changes if present**

```bash
git add src tests README.md docs assets/music
git commit -m "chore: format vertical campaign implementation"
```

Skip this commit when `npm run format` produced no changes.
