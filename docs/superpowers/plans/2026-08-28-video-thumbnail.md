# Video Thumbnail Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Generate a deterministic, crop-safe vertical thumbnail whose centered header, challenge, and CTA also form the first three seconds of every new video.

**Architecture:** A pure thumbnail-copy module derives one short question from the validated money scenario. The existing SVG layer owns one thumbnail layout and reuses it for the hook scene, while a focused renderer writes the review JPEG from the exact same SVG string used by the video renderer. Provider inputs remain single-video uploads and keep the verified two-second Buffer offset.

**Tech Stack:** TypeScript ESM, Node.js 24, Sharp, FFmpeg/FFprobe, Node test runner, Prettier.

---

## File map

- Create `src/render/thumbnail-copy.ts`: derive deterministic cover copy from a
  validated campaign plan.
- Create `src/render/thumbnail.ts`: write and verify the 1080×1920 sRGB JPEG
  artifact from an already-built SVG string.
- Modify `src/render/text-layout.ts`: define the thumbnail headline fitting
  contract.
- Modify `src/render/svg.ts`: calculate the crop-safe centered stack and make it
  the canonical hook-scene SVG.
- Modify `src/render/video.ts`: generate the JPEG and first scene from one SVG
  string and return thumbnail metadata.
- Modify `src/dry-run/create-review.ts`: expose the cover in the review HTML and
  manifest.
- Modify `src/cli/dry-run.ts`: include thumbnail dimensions in the concise CLI
  result.
- Modify `tests/video-render.test.ts`: cover the SVG, JPEG, first-scene, and
  two-second-frame contracts.
- Modify `tests/dry-run.test.ts`: cover review and manifest provenance.
- Modify `tests/pages-media.test.ts`: prove the review thumbnail does not alter
  the current durable provider-media schema.
- Modify `tests/package-contract.test.ts`: require operational documentation for
  the cover contract.
- Modify `README.md` and `docs/operations.md`: document generation, review, crop,
  and provider behavior.

### Task 1: Define thumbnail copy and centered SVG

**Files:**

- Create: `src/render/thumbnail-copy.ts`
- Modify: `src/render/text-layout.ts`
- Modify: `src/render/svg.ts`
- Create: `tests/thumbnail.test.ts`
- Modify: `tests/video-render.test.ts`

- [ ] **Step 1: Write the failing copy and layout tests**

Create `tests/thumbnail.test.ts` with the complete initial contract:

```ts
import assert from "node:assert/strict";
import test from "node:test";

import { loadBrand } from "../src/brand/load-brand.js";
import type { CampaignPlan } from "../src/editorial/schema.js";
import { createCampaign } from "../src/planning/create-campaign.js";
import { createThumbnailCopy } from "../src/render/thumbnail-copy.js";
import {
  createVerticalSceneSvg,
  createVerticalThumbnailSvg,
  thumbnailStackLayout,
} from "../src/render/svg.js";
import { canonicalBrandRoot } from "./support/brand-root.js";

function exactPaymentPlan(): CampaignPlan {
  const plan = createCampaign({
    localDate: "2026-08-27",
    publishTime: "12:17",
    history: [],
  });
  return {
    ...plan,
    scenario: {
      purchaseMinor: 5_000,
      receivedMinor: 5_000,
      resultMinor: 0,
      breakdown: [],
    },
    copy: { ...plan.copy, answer: "R$ 0,00" },
  };
}

test("thumbnail copy is short, deterministic, and keeps the answer hidden", () => {
  const plan = createCampaign({
    localDate: "2026-08-27",
    publishTime: "12:17",
    history: [],
  });
  const first = createThumbnailCopy(plan);
  const second = createThumbnailCopy(plan);

  assert.equal(first, second);
  assert.match(first, /^R\$ .+ para pagar R\$ .+\. Quanto volta\?$/u);
  assert.doesNotMatch(first, /https?:|#|troco\.net/iu);
  assert.ok(!first.includes(plan.copy.answer));
  assert.ok(first.length <= 64);
});

test("exact payment uses a truthful thumbnail question", () => {
  assert.equal(
    createThumbnailCopy(exactPaymentPlan()),
    "R$ 50,00 para pagar R$ 50,00. Tem troco?",
  );
});

test("thumbnail composition is centered and crop safe with forty-pixel gaps", async () => {
  const plan = createCampaign({
    localDate: "2026-08-27",
    publishTime: "12:17",
    history: [],
  });
  const brand = await loadBrand(canonicalBrandRoot());
  const layout = thumbnailStackLayout(plan);
  const thumbnail = createVerticalThumbnailSvg({ plan, brand });
  const hook = createVerticalSceneSvg({ plan, brand, scene: "hook" });

  assert.equal(layout.messageTop - layout.headerBottom, 40);
  assert.equal(layout.ctaTop - layout.messageBottom, 40);
  assert.ok(layout.top >= 420);
  assert.ok(layout.bottom <= 1500);
  assert.equal(hook, thumbnail);
  assert.match(thumbnail, />FAÇA A CONTA<\/text>/u);
  assert.match(thumbnail, />DESCUBRA NO VÍDEO<\/text>/u);
  assert.match(thumbnail, />12s →<\/text>/u);
  assert.match(thumbnail, /<image x="30"/u);
  assert.doesNotMatch(thumbnail, /01\/04/u);
});
```

- [ ] **Step 2: Run the focused test and verify RED**

Run:

```bash
PATH=/Users/guilherme/.nvm/versions/node/v24.14.1/bin:/opt/homebrew/bin:/usr/bin:/bin node --import tsx --test tests/thumbnail.test.ts
```

Expected: FAIL because `thumbnail-copy.ts`, `createVerticalThumbnailSvg`, and
`thumbnailStackLayout` do not exist.

- [ ] **Step 3: Implement the pure copy builder**

Create `src/render/thumbnail-copy.ts`:

```ts
import { formatMinor } from "@trocohq/core";

import type { CampaignPlan } from "../editorial/schema.js";

export function createThumbnailCopy(
  plan: Pick<CampaignPlan, "scenario">,
): string {
  const purchase = formatMinor(plan.scenario.purchaseMinor, "BRL", "pt-BR");
  const received = formatMinor(plan.scenario.receivedMinor, "BRL", "pt-BR");
  const question =
    plan.scenario.resultMinor === 0 ? "Tem troco?" : "Quanto volta?";
  return `${received} para pagar ${purchase}. ${question}`;
}
```

- [ ] **Step 4: Add the thumbnail text-fitting contract**

Add this exported constant to `src/render/text-layout.ts` after
`verticalTextLayouts`:

```ts
export const thumbnailHeadlineLayout: FitTextOptions = Object.freeze({
  maxWidth: 1020,
  maxHeight: 600,
  maximumFontSize: 124,
  minimumFontSize: 80,
  lineHeightRatio: 1.02,
});
```

- [ ] **Step 5: Add the centered thumbnail stack to the SVG layer**

In `src/render/svg.ts`, import `createThumbnailCopy` and
`thumbnailHeadlineLayout`, then add these contracts beside the existing vertical
constants:

```ts
export const THUMBNAIL_SECTION_GAP = 40;
export const THUMBNAIL_CROP_TOP = 420;
export const THUMBNAIL_CROP_BOTTOM = 1500;
const THUMBNAIL_HEADER_HEIGHT = 82;
const THUMBNAIL_KICKER_HEIGHT = 38;
const THUMBNAIL_MESSAGE_INSET = 16;
const THUMBNAIL_CTA_HEIGHT = 190;

export type ThumbnailStackLayout = Readonly<{
  top: number;
  headerBottom: number;
  messageTop: number;
  messageBottom: number;
  ctaTop: number;
  bottom: number;
  headline: TextLayout;
}>;

export function thumbnailStackLayout(
  plan: Pick<CampaignPlan, "scenario">,
): ThumbnailStackLayout {
  const headline = fitText(createThumbnailCopy(plan), thumbnailHeadlineLayout);
  const messageHeight =
    THUMBNAIL_KICKER_HEIGHT + THUMBNAIL_MESSAGE_INSET + headline.height;
  const totalHeight =
    THUMBNAIL_HEADER_HEIGHT +
    THUMBNAIL_SECTION_GAP +
    messageHeight +
    THUMBNAIL_SECTION_GAP +
    THUMBNAIL_CTA_HEIGHT;
  const cropHeight = THUMBNAIL_CROP_BOTTOM - THUMBNAIL_CROP_TOP;
  if (totalHeight > cropHeight) {
    throw new Error("Thumbnail stack escapes its centered square crop");
  }
  const top = THUMBNAIL_CROP_TOP + Math.floor((cropHeight - totalHeight) / 2);
  const headerBottom = top + THUMBNAIL_HEADER_HEIGHT;
  const messageTop = headerBottom + THUMBNAIL_SECTION_GAP;
  const messageBottom = messageTop + messageHeight;
  const ctaTop = messageBottom + THUMBNAIL_SECTION_GAP;
  return Object.freeze({
    top,
    headerBottom,
    messageTop,
    messageBottom,
    ctaTop,
    bottom: ctaTop + THUMBNAIL_CTA_HEIGHT,
    headline,
  });
}
```

Add this full builder before `verticalScenes`:

```ts
export function createVerticalThumbnailSvg({
  plan,
  brand,
}: Readonly<{
  plan: CampaignPlan;
  brand: BrandAssets;
}>): string {
  const background = backgroundByPalette[plan.palette];
  const mark = Buffer.from(brand.markSvg).toString("base64");
  const label = familyLabels[plan.family];
  const layout = thumbnailStackLayout(plan);
  const messageTop = layout.messageTop;
  const questionTop =
    messageTop + THUMBNAIL_KICKER_HEIGHT + THUMBNAIL_MESSAGE_INSET;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${WIDTH}" height="${VERTICAL_HEIGHT}" viewBox="0 0 ${WIDTH} ${VERTICAL_HEIGHT}">
    ${embeddedFonts(brand)}
    <rect width="${WIDTH}" height="${VERTICAL_HEIGHT}" fill="${background}"/>
    <image x="${VERTICAL_FRAME.x}" y="${layout.top}" width="82" height="82" href="data:image/svg+xml;base64,${mark}"/>
    <text x="${VERTICAL_FRAME.x + 106}" y="${layout.top + 65}" fill="${designTokens.colors.ink}" font-family="Figtree" font-size="32" font-weight="700">TROCO</text>
    <rect x="706" y="${layout.top + 10}" width="344" height="62" rx="31" fill="${designTokens.colors.paper}" fill-opacity="0.78"/>
    <text x="878" y="${layout.top + 50}" text-anchor="middle" fill="${designTokens.colors.ink}" font-family="Figtree" font-size="22" font-weight="700">${escapeXml(label)}</text>
    <text x="${VERTICAL_FRAME.x}" y="${messageTop + THUMBNAIL_KICKER_HEIGHT}" fill="${designTokens.colors.ink}" font-family="Figtree" font-size="38" font-weight="800">FAÇA A CONTA</text>
    ${textBlock(layout.headline, VERTICAL_FRAME.x, questionTop, "Stolzl")}
    <rect x="${VERTICAL_FRAME.x}" y="${layout.ctaTop}" width="${VERTICAL_FRAME.width}" height="${THUMBNAIL_CTA_HEIGHT}" rx="40" fill="${designTokens.colors.ink}"/>
    <text x="${VERTICAL_FRAME.x + CONTAINER_INSET}" y="${layout.ctaTop + 116}" fill="${designTokens.colors.paper}" font-family="Figtree" font-size="46" font-weight="700">DESCUBRA NO VÍDEO</text>
    <text x="${VERTICAL_FRAME.right - CONTAINER_INSET}" y="${layout.ctaTop + 116}" text-anchor="end" fill="${designTokens.colors.primary}" font-family="Figtree" font-size="40" font-weight="700">12s →</text>
  </svg>`;
}
```

At the start of `createVerticalSceneSvg`, return the canonical thumbnail for the
hook before calculating the ordinary scene index:

```ts
if (scene === "hook") {
  return createVerticalThumbnailSvg({ plan, brand });
}
```

Remove the old `scene === "hook"` branch from `verticalSceneContent`; scenario,
answer, and end-card markup remain unchanged.

- [ ] **Step 6: Replace the superseded hook-scene regression assertions**

In `tests/video-render.test.ts`, import `createVerticalThumbnailSvg`, remove the
`hookSize` calculation, and replace the old hook size and top-header assertions
with:

```ts
assert.equal(hook, createVerticalThumbnailSvg({ plan, brand }));
assert.match(hook, />FAÇA A CONTA<\/text>/u);
assert.match(hook, />DESCUBRA NO VÍDEO<\/text>/u);
assert.doesNotMatch(hook, /01\/04/u);
```

- [ ] **Step 7: Run the focused test and verify GREEN**

Run:

```bash
PATH=/Users/guilherme/.nvm/versions/node/v24.14.1/bin:/opt/homebrew/bin:/usr/bin:/bin node --import tsx --test tests/thumbnail.test.ts
```

Expected: 3 tests pass and 0 fail.

- [ ] **Step 8: Run type and existing SVG regression checks**

Run:

```bash
PATH=/Users/guilherme/.nvm/versions/node/v24.14.1/bin:/opt/homebrew/bin:/usr/bin:/bin npm run typecheck
PATH=/Users/guilherme/.nvm/versions/node/v24.14.1/bin:/opt/homebrew/bin:/usr/bin:/bin node --import tsx --test tests/video-render.test.ts tests/image-render.test.ts
```

Expected: typecheck and all focused media tests pass.

- [ ] **Step 9: Commit the copy and SVG contract**

```bash
git add src/render/thumbnail-copy.ts src/render/text-layout.ts src/render/svg.ts tests/thumbnail.test.ts tests/video-render.test.ts
git commit -m "feat: define centered video thumbnail"
```

### Task 2: Render the JPEG and reuse it in the video

**Files:**

- Create: `src/render/thumbnail.ts`
- Modify: `src/render/video.ts`
- Modify: `tests/video-render.test.ts`

- [ ] **Step 1: Extend the video test with a failing thumbnail artifact contract**

Add these imports to `tests/video-render.test.ts` (the SVG import already comes
from Task 1), then extend the first video test with:

```ts
import sharp from "sharp";

import { runProcess } from "../src/render/binaries.js";
```

```ts
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
```

After rendering `repeated`, add:

```ts
assert.equal(repeated.thumbnail.hash, video.thumbnail.hash);
assert.deepEqual(
  await readFile(repeated.thumbnail.file),
  await readFile(video.thumbnail.file),
);
```

- [ ] **Step 2: Run the video test and verify RED**

Run:

```bash
PATH=/Users/guilherme/.nvm/versions/node/v24.14.1/bin:/opt/homebrew/bin:/usr/bin:/bin node --import tsx --test tests/video-render.test.ts
```

Expected: FAIL because `RenderedVideo` has no `thumbnail` result.

- [ ] **Step 3: Implement the focused JPEG renderer**

Create `src/render/thumbnail.ts`:

```ts
import { mkdir, readFile } from "node:fs/promises";
import { join, resolve } from "node:path";

import { designTokens } from "@trocohq/design-tokens";
import sharp from "sharp";

import { sha256 } from "../shared/determinism.js";

const WIDTH = 1080;
const HEIGHT = 1920;
const MAXIMUM_BYTES = 8_000_000;

export type RenderedThumbnail = Readonly<{
  file: string;
  hash: string;
  width: 1080;
  height: 1920;
  format: "jpeg";
}>;

export async function renderVideoThumbnail({
  svg,
  output,
}: Readonly<{
  svg: string;
  output: string;
}>): Promise<RenderedThumbnail> {
  const outputRoot = resolve(output);
  await mkdir(outputRoot, { recursive: true });
  const file = join(outputRoot, "thumbnail.jpg");
  await sharp(Buffer.from(svg))
    .flatten({ background: designTokens.colors.paper })
    .toColourspace("srgb")
    .jpeg({ quality: 90, chromaSubsampling: "4:4:4", mozjpeg: true })
    .toFile(file);
  const metadata = await sharp(file).metadata();
  if (
    metadata.width !== WIDTH ||
    metadata.height !== HEIGHT ||
    metadata.format !== "jpeg" ||
    metadata.space !== "srgb"
  ) {
    throw new Error("Rendered thumbnail failed its media contract");
  }
  const bytes = await readFile(file);
  if (bytes.length > MAXIMUM_BYTES) {
    throw new Error("Rendered thumbnail exceeds 8 MB");
  }
  return Object.freeze({
    file,
    hash: sha256(bytes),
    width: WIDTH,
    height: HEIGHT,
    format: "jpeg",
  });
}
```

- [ ] **Step 4: Generate one SVG string for both outputs**

In `src/render/video.ts`, import `createVerticalThumbnailSvg`,
`renderVideoThumbnail`, and `RenderedThumbnail`. Add `thumbnail` to
`RenderedVideo`:

```ts
thumbnail: RenderedThumbnail;
```

After creating `videoPath`, create the source once:

```ts
const thumbnailSvg = createVerticalThumbnailSvg({ plan, brand });
const thumbnail = await renderVideoThumbnail({
  svg: thumbnailSvg,
  output: outputRoot,
});
```

Inside the scene loop, replace the SVG assignment with:

```ts
const svg =
  scene === "hook"
    ? thumbnailSvg
    : createVerticalSceneSvg({ plan, brand, scene });
```

Include `thumbnail` in the frozen return value:

```ts
      thumbnail,
```

- [ ] **Step 5: Add a two-second visual-similarity assertion**

In the first video test, extract the frame Buffer selects and compare decoded
RGB pixels against the dedicated JPEG:

```ts
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
```

- [ ] **Step 6: Run the renderer tests and verify GREEN**

Run:

```bash
PATH=/Users/guilherme/.nvm/versions/node/v24.14.1/bin:/opt/homebrew/bin:/usr/bin:/bin node --import tsx --test tests/thumbnail.test.ts tests/video-render.test.ts
```

Expected: all thumbnail and video tests pass with a deterministic JPEG, H.264
video, AAC Enterprise excerpt, and mean frame difference below 18.

- [ ] **Step 7: Commit the rendering integration**

```bash
git add src/render/thumbnail.ts src/render/video.ts tests/video-render.test.ts
git commit -m "feat: render deterministic video thumbnails"
```

### Task 3: Expose the cover in dry-run review without changing provider state

**Files:**

- Modify: `src/dry-run/create-review.ts`
- Modify: `src/cli/dry-run.ts`
- Modify: `tests/dry-run.test.ts`
- Modify: `tests/pages-media.test.ts`

- [ ] **Step 1: Write failing review and persistence-boundary tests**

In `tests/dry-run.test.ts`, extend the first test with:

```ts
assert.deepEqual(manifest.video.thumbnail, {
  path: "video/thumbnail.jpg",
  hash: review.media.video.thumbnail.hash,
  width: 1080,
  height: 1920,
  format: "jpeg",
});
const reviewHtml = await readFile(join(output, "index.html"), "utf8");
assert.match(reviewHtml, /Capa vertical/u);
assert.match(reviewHtml, /video\/thumbnail\.jpg/u);
assert.match(reviewHtml, new RegExp(review.media.video.thumbnail.hash));
```

In `tests/pages-media.test.ts`, add `stat` to the `node:fs/promises` import. In
the Pages payload fixture, add an unrelated generated thumbnail beside
`short.mp4`:

```ts
const thumbnail = Buffer.from("thumbnail-bytes");
await writeFile(join(campaignRoot, "video", "thumbnail.jpg"), thumbnail);
```

Then assert after payload creation:

```ts
await assert.rejects(
  stat(
    join(pagesRoot, "media", localDate, campaignId, "video", "thumbnail.jpg"),
  ),
  /ENOENT/,
);
```

- [ ] **Step 2: Run both tests and verify RED**

Run:

```bash
PATH=/Users/guilherme/.nvm/versions/node/v24.14.1/bin:/opt/homebrew/bin:/usr/bin:/bin node --import tsx --test tests/dry-run.test.ts tests/pages-media.test.ts
```

Expected: dry-run assertions fail because the manifest and HTML do not expose
the thumbnail; the Pages assertion documents the existing allowlist boundary.

- [ ] **Step 3: Add thumbnail review markup and manifest provenance**

In `src/dry-run/create-review.ts`, add this figure before the video element:

```ts
    <figure>
      <img src="${escapeXml(localAssetPath(root, video.thumbnail.file))}" alt="Capa vertical da campanha ${escapeXml(campaignId)}">
      <figcaption>Capa vertical · SHA-256 ${escapeXml(video.thumbnail.hash)}</figcaption>
    </figure>
```

Add the nested thumbnail contract to `manifest.video`:

```ts
      thumbnail: {
        path: localAssetPath(outputRoot, video.thumbnail.file),
        hash: video.thumbnail.hash,
        width: video.thumbnail.width,
        height: video.thumbnail.height,
        format: video.thumbnail.format,
      },
```

In `src/cli/dry-run.ts`, add this nested field beside the video dimensions:

```ts
        thumbnail: {
          width: review.media.video.thumbnail.width,
          height: review.media.video.thumbnail.height,
        },
```

- [ ] **Step 4: Run review and Pages tests and verify GREEN**

Run:

```bash
PATH=/Users/guilherme/.nvm/versions/node/v24.14.1/bin:/opt/homebrew/bin:/usr/bin:/bin node --import tsx --test tests/dry-run.test.ts tests/pages-media.test.ts
```

Expected: review metadata passes and Pages still copies only the feed slides and
`short.mp4` listed by the durable media record.

- [ ] **Step 5: Commit the review contract**

```bash
git add src/dry-run/create-review.ts src/cli/dry-run.ts tests/dry-run.test.ts tests/pages-media.test.ts
git commit -m "feat: expose video thumbnail reviews"
```

### Task 4: Document thumbnail generation and operational review

**Files:**

- Modify: `README.md`
- Modify: `docs/operations.md`
- Modify: `tests/package-contract.test.ts`

- [ ] **Step 1: Add a failing documentation contract**

Add this test to `tests/package-contract.test.ts`:

```ts
test("operations document the deterministic crop-safe video cover", async () => {
  const readme = await readFile(
    new URL("../README.md", import.meta.url),
    "utf8",
  );
  const operations = await readFile(
    new URL("../docs/operations.md", import.meta.url),
    "utf8",
  );
  assert.match(readme, /dedicated 1080×1920 video thumbnail/u);
  assert.match(readme, /same opening scene/u);
  assert.match(operations, /40-pixel gaps/u);
  assert.match(operations, /two-second frame/u);
  assert.match(operations, /square crop-safe region/u);
});
```

- [ ] **Step 2: Run the package test and verify RED**

Run:

```bash
PATH=/Users/guilherme/.nvm/versions/node/v24.14.1/bin:/opt/homebrew/bin:/usr/bin:/bin node --import tsx --test tests/package-contract.test.ts
```

Expected: FAIL because README and operations do not yet explain the cover.

- [ ] **Step 3: Update README and operations**

Add this paragraph to the README's generated-content section:

```markdown
Every new video also receives a dedicated 1080×1920 video thumbnail. The same
opening scene remains on screen through Buffer's two-second selection point, so
the reviewed JPEG and social cover share one deterministic layout. Brand,
question, and CTA form one centered crop-safe block; the answer remains inside
the video.
```

Add this checklist to the controlled-review section of `docs/operations.md`:

```markdown
### Video thumbnail

- Confirm the brand header, `FAÇA A CONTA`, and CTA form one centered block.
- Confirm both section gaps are 40-pixel gaps in the generated layout contract.
- Confirm all essential content remains inside the square crop-safe region.
- Compare the dedicated JPEG with the video's two-second frame.
- Reject a cover that reveals the answer, clips text, substitutes the mark, or
  uses a color outside the official Troco palette.
```

- [ ] **Step 4: Run documentation and focused media tests**

Run:

```bash
PATH=/Users/guilherme/.nvm/versions/node/v24.14.1/bin:/opt/homebrew/bin:/usr/bin:/bin node --import tsx --test tests/package-contract.test.ts tests/thumbnail.test.ts tests/video-render.test.ts tests/dry-run.test.ts tests/pages-media.test.ts
```

Expected: all focused tests pass.

- [ ] **Step 5: Commit the documentation**

```bash
git add README.md docs/operations.md tests/package-contract.test.ts
git commit -m "docs: explain video thumbnail review"
```

### Task 5: Complete verification and visual review

**Files:**

- Verify only; no source file is expected to change.

- [ ] **Step 1: Format and run the complete quality gate**

Run:

```bash
PATH=/Users/guilherme/.nvm/versions/node/v24.14.1/bin:/opt/homebrew/bin:/usr/bin:/bin npm run format
PATH=/Users/guilherme/.nvm/versions/node/v24.14.1/bin:/opt/homebrew/bin:/usr/bin:/bin npm run check
```

Expected: Prettier leaves the intended files formatted; typecheck passes; all
tests pass with 0 failures.

- [ ] **Step 2: Run operational validation**

Run:

```bash
PATH=/Users/guilherme/.nvm/versions/node/v24.14.1/bin:/opt/homebrew/bin:/usr/bin:/bin npm run validate
```

Expected: one JSON line with `"ok":true`, seven tracked campaigns, and three
provider contracts.

- [ ] **Step 3: Generate a fresh review bundle**

Run:

```bash
PATH=/Users/guilherme/.nvm/versions/node/v24.14.1/bin:/opt/homebrew/bin:/usr/bin:/bin npm run dry-run -- --date 2026-08-28 --output .tmp/thumbnail-verification --brand-root ../frontend/public
```

Expected: success JSON identifies the campaign, one 1080×1920 thumbnail, and a
12-second 1080×1920 video.

- [ ] **Step 4: Inspect the dedicated JPEG and video frames**

Open `.tmp/thumbnail-verification/index.html`, then verify:

- the full block is centered vertically;
- the two section gaps read as one consistent 40-pixel rhythm;
- the question dominates while the brand and CTA remain legible;
- the answer is absent from the cover;
- no essential element leaves the centered square crop-safe region;
- frames at zero and two seconds match the dedicated thumbnail visually;
- the remaining scenes, Enterprise music, fades, and `troco.net` end card remain
  unchanged.

- [ ] **Step 5: Confirm repository hygiene**

Run:

```bash
git diff --check
git status --short --branch
git log --oneline origin/main..HEAD
```

Expected: no tracked changes remain after the micro-commits; `.DS_Store` and the
visual-companion `.superpowers/` directory remain untracked and are not staged;
the local `main` is ahead of `origin/main`; no push occurs.
