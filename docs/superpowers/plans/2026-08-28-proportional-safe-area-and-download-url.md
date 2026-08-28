# Proportional Safe Area and Download URL Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Apply proportional outer margins and stronger explanatory typography to every rendered social asset while moving all newly generated acquisition links to `https://troco.net`.

**Architecture:** Add one pure safe-area calculator and consume its immutable frames from the feed, carousel, and vertical SVG renderer. Keep text fitting deterministic, but give explanatory copy a larger bold layout. Rename the provider-specific download configuration throughout the planning path and use a strict, provider-neutral `APP_DOWNLOAD_URL` contract with `https://troco.net` as its safe default.

**Tech Stack:** Node.js 24, strict TypeScript, SVG, Sharp, FFmpeg, Zod, Node test runner, GitHub Actions.

---

## File structure

- Create `src/render/safe-area.ts` for proportional frame calculation only.
- Create `tests/safe-area.test.ts` for exact feed and vertical margin contracts.
- Modify `src/render/svg.ts` for frame-aware SVG coordinates and explanation weight.
- Modify `src/render/text-layout.ts` for approved explanation type ranges.
- Modify `tests/image-render.test.ts` and `tests/video-render.test.ts` for SVG hierarchy contracts.
- Modify `src/editorial/copy.ts`, `src/planning/create-campaign.ts`, and `src/cli/plan.ts` to use an app-download URL instead of a Play Store-specific name.
- Modify `src/config/environment.ts`, `.env.example`, and `.github/workflows/publish.yml` for `APP_DOWNLOAD_URL`.
- Modify `tests/editorial-copy.test.ts`, `tests/create-campaign.test.ts`, `tests/environment.test.ts`, `tests/support/environment-fixture.ts`, and `tests/workflows.test.ts` for the canonical `troco.net` origin.
- Modify `README.md` and `docs/operations.md` where the live download-link contract is described.
- Do not edit immutable campaign state already scheduled with providers.

### Task 1: Add the proportional safe-area contract

**Files:**

- Create: `src/render/safe-area.ts`
- Create: `tests/safe-area.test.ts`

- [ ] **Step 1: Write the failing safe-area tests**

Create `tests/safe-area.test.ts`:

```ts
import assert from "node:assert/strict";
import test from "node:test";

import { safeAreaFor } from "../src/render/safe-area.js";

test("feed safe area preserves the approved 30 by 60 reference", () => {
  assert.deepEqual(safeAreaFor(1080, 1350), {
    x: 30,
    y: 60,
    right: 1050,
    bottom: 1290,
    width: 1020,
    height: 1230,
  });
});

test("vertical safe area scales the vertical margin proportionally", () => {
  assert.deepEqual(safeAreaFor(1080, 1920), {
    x: 30,
    y: 85,
    right: 1050,
    bottom: 1835,
    width: 1020,
    height: 1750,
  });
});

test("safe area rejects invalid canvas dimensions", () => {
  assert.throws(() => safeAreaFor(0, 1350), /positive integers/);
  assert.throws(() => safeAreaFor(1080, 1.5), /positive integers/);
});
```

- [ ] **Step 2: Run the focused test and verify RED**

Run:

```bash
PATH=/Users/guilherme/.nvm/versions/node/v24.14.1/bin:$PATH node --import tsx --test tests/safe-area.test.ts
```

Expected: FAIL because `src/render/safe-area.ts` does not exist.

- [ ] **Step 3: Implement the pure safe-area calculator**

Create `src/render/safe-area.ts`:

```ts
const REFERENCE_WIDTH = 1080;
const REFERENCE_HEIGHT = 1350;
const REFERENCE_HORIZONTAL_MARGIN = 30;
const REFERENCE_VERTICAL_MARGIN = 60;

export type SafeArea = Readonly<{
  x: number;
  y: number;
  right: number;
  bottom: number;
  width: number;
  height: number;
}>;

export function safeAreaFor(width: number, height: number): SafeArea {
  if (
    !Number.isInteger(width) ||
    !Number.isInteger(height) ||
    width <= 0 ||
    height <= 0
  ) {
    throw new Error("Canvas dimensions must be positive integers");
  }
  const x = Math.round((width * REFERENCE_HORIZONTAL_MARGIN) / REFERENCE_WIDTH);
  const y = Math.round((height * REFERENCE_VERTICAL_MARGIN) / REFERENCE_HEIGHT);
  return Object.freeze({
    x,
    y,
    right: width - x,
    bottom: height - y,
    width: width - x * 2,
    height: height - y * 2,
  });
}
```

- [ ] **Step 4: Run the focused test and verify GREEN**

Run the command from Step 2.

Expected: 3 tests pass.

- [ ] **Step 5: Commit the safe-area primitive**

```bash
git add src/render/safe-area.ts tests/safe-area.test.ts
git commit -m "feat: add proportional social safe area"
```

### Task 2: Apply the frame and stronger explanation hierarchy

**Files:**

- Modify: `src/render/svg.ts`
- Modify: `src/render/text-layout.ts`
- Modify: `tests/image-render.test.ts`
- Modify: `tests/video-render.test.ts`

- [ ] **Step 1: Replace the old 96-pixel assertions with failing proportional-frame assertions**

In `tests/image-render.test.ts`, rename the worst-case test to
`worst-case editorial text fits inside the proportional feed frame`, import
`safeAreaFor`, and assert the wider limits:

```ts
const feedFrame = safeAreaFor(1080, 1350);
assert.equal(feedFrame.x, 30);
assert.equal(feedFrame.y, 60);
assert.ok(display.width <= feedFrame.width && display.height <= 420);
assert.ok(body.width <= feedFrame.width && body.height <= 140);
assert.ok(cta.width <= feedFrame.width - 96 && cta.height <= 100);
assert.ok(body.fontSize >= 48);
```

Extend `feed hierarchy uses larger type and a distinct call-to-action stage`
with exact outer-frame and explanation assertions:

```ts
assert.match(svg, /<image x="30" y="60" width="72" height="72"/u);
assert.match(svg, /<rect x="30" y="610" width="1020" height="390"/u);
assert.match(svg, /<rect x="30" y="1160" width="1020" height="130"/u);
assert.match(
  svg,
  /font-family="Figtree" font-size="(?:5[0-4]|4[8-9])" font-weight="700"><tspan x="30"/u,
);
```

Add a carousel assertion using the 2026-08-25 campaign:

```ts
const carousel = createCampaign({
  localDate: "2026-08-25",
  publishTime: "12:17",
  history: [],
});
const lastSlide = createFeedSlideSvg({
  plan: carousel,
  brand,
  slide: carousel.slideCount - 1,
});
assert.match(lastSlide, /<rect x="30" y="980" width="1020" height="200"/u);
assert.match(lastSlide, /font-weight="700"><tspan x="30"/u);
```

In `tests/video-render.test.ts`, extend the vertical hierarchy test:

```ts
assert.match(hook, /<image x="30" y="85" width="82" height="82"/u);
assert.match(scenario, /<rect x="30" y="670" width="1020" height="620"/u);
assert.match(answer, /<rect x="30" y="980" width="1020" height="470"/u);
assert.match(endCard, /<rect x="30" y="1280" width="1020" height="430"/u);
assert.match(
  endCard,
  /font-family="Figtree" font-size="(?:[5-7][0-9])" font-weight="700"><tspan x="30"/u,
);
assert.match(endCard, /<text x="78" y="1640"[^>]*>troco\.net<\/text>/u);
```

- [ ] **Step 2: Run renderer tests and verify RED**

Run:

```bash
PATH=/Users/guilherme/.nvm/versions/node/v24.14.1/bin:$PATH node --import tsx --test tests/image-render.test.ts tests/video-render.test.ts
```

Expected: FAIL because SVG output still uses the 96-pixel frame and regular explanation text.

- [ ] **Step 3: Expand the deterministic explanation layouts**

Update `src/render/text-layout.ts` to these explanation contracts:

```ts
// feedTextLayouts.explanation
{
  maxWidth: 1020,
  maxHeight: 140,
  maximumFontSize: 54,
  minimumFontSize: 48,
  lineHeightRatio: 1.1,
}

// carouselTextLayouts.explanation
{
  maxWidth: 1020,
  maxHeight: 600,
  maximumFontSize: 60,
  minimumFontSize: 46,
  lineHeightRatio: 1.1,
}

// verticalTextLayouts.explanation
{
  maxWidth: 1020,
  maxHeight: 760,
  maximumFontSize: 72,
  minimumFontSize: 52,
  lineHeightRatio: 1.1,
}
```

Update headline and CTA widths from 888/792/780 to the safe frame width or the
safe frame width minus 96 pixels of internal padding, without lowering their
existing minimum font sizes.

- [ ] **Step 4: Refactor the SVG renderer around two immutable frames**

In `src/render/svg.ts`, import `safeAreaFor` and replace `SAFE` with:

```ts
const WIDTH = 1080;
const HEIGHT = 1350;
const VERTICAL_HEIGHT = 1920;
const FEED_FRAME = safeAreaFor(WIDTH, HEIGHT);
const VERTICAL_FRAME = safeAreaFor(WIDTH, VERTICAL_HEIGHT);
const CONTAINER_INSET = 48;
```

Apply these exact outer coordinates:

```ts
// Feed header and footer
mark: x=30, y=60
brand label: x=126
family pill: x=720, width=330
slide counter: x=1050, y=1270

// Feed scenario and CTA
scenario card: x=30, y=610, width=1020, height=390
scenario content: left=78, right=1002
answer band: x=62, width=956
explanation: x=30, top=1020, Figtree 700
CTA card: x=30, y=1160, width=1020, height=130
CTA text: x=78, top=1174

// Carousel outer containers
all primary text: x=30
scenario card: x=30, width=1020
answer detail card: x=30, width=1020; text x=78
final CTA card: x=30, width=1020; text x=78

// Vertical header and footer
mark: x=30, y=85
brand label: x=136
family pill: x=706, width=344
scene counter: x=1050, y=1810

// Vertical outer containers
all primary text: x=30
hook CTA: x=30, width=1020
scenario card: x=30, width=1020; content left=78, right=1002
answer detail card: x=30, width=1020; content x=78
end-card CTA: x=30, width=1020; content x=78
```

Pass `700` to `textBlock` for feed explanation, carousel explanation, and the
vertical end-card explanation. Preserve all canvas dimensions, colors, brand
assets, and existing scene timing.

- [ ] **Step 5: Run focused renderer tests and adjust only collisions**

Run the command from Step 2.

Expected: both test files pass. If a reviewed worst-case string does not fit,
reduce only the relevant maximum font size while keeping feed explanation at or
above 48 pixels and vertical explanation at or above 52 pixels.

- [ ] **Step 6: Commit the renderer change**

```bash
git add src/render/svg.ts src/render/text-layout.ts tests/image-render.test.ts tests/video-render.test.ts
git commit -m "feat: refine social asset hierarchy"
```

### Task 3: Move acquisition links to troco.net

**Files:**

- Modify: `src/editorial/copy.ts`
- Modify: `src/planning/create-campaign.ts`
- Modify: `src/cli/plan.ts`
- Modify: `src/config/environment.ts`
- Modify: `.env.example`
- Modify: `.github/workflows/publish.yml`
- Modify: `tests/editorial-copy.test.ts`
- Modify: `tests/create-campaign.test.ts`
- Modify: `tests/environment.test.ts`
- Modify: `tests/support/environment-fixture.ts`
- Modify: `tests/workflows.test.ts`
- Modify: `README.md`
- Modify: `docs/operations.md`

- [ ] **Step 1: Write failing canonical-URL tests**

In `tests/editorial-copy.test.ts`, add:

```ts
test("channel acquisition links use troco.net with deterministic attribution", () => {
  const copy = createCampaignCopy({ ...input, hook: "Quanto volta?" });
  const instagram = new URL(
    copy.channels.instagram.caption
      .split("\n")
      .find((line) => line.startsWith("https://"))!,
  );
  assert.equal(instagram.origin, "https://troco.net");
  assert.equal(instagram.pathname, "/");
  assert.equal(instagram.searchParams.get("utm_source"), "instagram");
  assert.equal(instagram.searchParams.get("utm_medium"), "social");
  assert.equal(instagram.searchParams.get("utm_campaign"), input.campaignId);
  assert.equal(instagram.searchParams.get("utm_content"), input.family);
});
```

In `tests/create-campaign.test.ts`, add origin assertions for all four channel
copies and remove assertions that require the direct Google Play URL.

In `tests/environment.test.ts`, replace `PLAY_STORE_URL` with
`APP_DOWNLOAD_URL: "https://troco.net"`, assert
`parseEnvironment(valid).appDownloadUrl === "https://troco.net"`, assert the
field defaults to the same value when omitted, and reject any non-Troco origin.

In `tests/workflows.test.ts`, assert:

```ts
assert.match(publishWorkflow, /APP_DOWNLOAD_URL: https:\/\/troco\.net/u);
assert.doesNotMatch(publishWorkflow, /PLAY_STORE_URL/u);
```

- [ ] **Step 2: Run URL and workflow tests and verify RED**

Run:

```bash
PATH=/Users/guilherme/.nvm/versions/node/v24.14.1/bin:$PATH node --import tsx --test tests/editorial-copy.test.ts tests/create-campaign.test.ts tests/environment.test.ts tests/workflows.test.ts
```

Expected: FAIL because the default and environment contract still use Google
Play and `PLAY_STORE_URL`.

- [ ] **Step 3: Rename the copy and planning inputs**

In `src/editorial/copy.ts`:

```ts
export const DEFAULT_APP_DOWNLOAD_URL = "https://troco.net";

export type CreateCampaignCopyInput = Readonly<{
  campaignId: string;
  family: CampaignFamily;
  hook: string;
  scenario: Scenario;
  fact: Fact;
  calendarMoment?: CalendarMoment;
  ctaKind: CtaKind;
  appDownloadUrl?: string;
}>;
```

Default `appDownloadUrl` to `DEFAULT_APP_DOWNLOAD_URL` and pass it to
`attributedUrl`. Rename `playStoreUrl` to `appDownloadUrl` in
`src/planning/create-campaign.ts` and `src/cli/plan.ts` without changing campaign
selection or fingerprints.

- [ ] **Step 4: Implement the strict provider-neutral environment contract**

In `src/config/environment.ts`, replace `PLAY_STORE_URL` with:

```ts
APP_DOWNLOAD_URL: z.literal("https://troco.net").default("https://troco.net"),
```

Rename `PublisherEnvironment.playStoreUrl` to `appDownloadUrl` and return
`parsed.APP_DOWNLOAD_URL`. Because environment selection is schema-driven, an
old ignored `PLAY_STORE_URL` in a developer's private `.env` cannot override the
safe canonical default.

Update `.env.example` and `.github/workflows/publish.yml` to:

```text
APP_DOWNLOAD_URL=https://troco.net
```

Update `tests/support/environment-fixture.ts` to use the new field.

- [ ] **Step 5: Update live documentation wording**

In `README.md`, replace “its own Google Play URL” with “its own attributed
`troco.net` download URL”. In `docs/operations.md`, describe
`APP_DOWNLOAD_URL=https://troco.net` as non-secret runtime configuration. Do not
rewrite historical design and implementation-plan documents.

- [ ] **Step 6: Run focused URL tests and verify GREEN**

Run the command from Step 2.

Expected: all focused tests pass and no live source, workflow, fixture, README,
or operations document contains `PLAY_STORE_URL` or the direct Google Play
listing.

- [ ] **Step 7: Commit the acquisition URL migration**

```bash
git add .env.example .github/workflows/publish.yml README.md docs/operations.md src/config/environment.ts src/editorial/copy.ts src/planning/create-campaign.ts src/cli/plan.ts tests/editorial-copy.test.ts tests/create-campaign.test.ts tests/environment.test.ts tests/support/environment-fixture.ts tests/workflows.test.ts
git commit -m "feat: route social acquisition through troco.net"
```

### Task 4: Verify the complete system and refresh the local review

**Files:**

- Generated only: `.tmp/final-verification/**` (ignored)

- [ ] **Step 1: Format and run the complete test suite**

Run:

```bash
PATH=/Users/guilherme/.nvm/versions/node/v24.14.1/bin:$PATH npm run format
PATH=/Users/guilherme/.nvm/versions/node/v24.14.1/bin:$PATH npm run check
```

Expected: formatting, TypeScript, and all tests pass.

- [ ] **Step 2: Run production media validation**

Run:

```bash
PATH=/Users/guilherme/.nvm/versions/node/v24.14.1/bin:$PATH npm run validate
```

Expected: sanitized JSON with `"ok":true`; feed JPEG and short MP4 contracts pass.

- [ ] **Step 3: Regenerate the reviewed local bundle**

Run:

```bash
PATH=/Users/guilherme/.nvm/versions/node/v24.14.1/bin:$PATH npm run dry-run -- --date 2026-08-26 --brand-root ../frontend/public --output .tmp/final-verification
```

Expected: `.tmp/final-verification/index.html`, one feed JPEG, one vertical MP4,
captions, campaign JSON, and manifest are regenerated without network writes or
durable state changes.

- [ ] **Step 4: Inspect the browser preview**

Reload `http://127.0.0.1:8765/`. Verify the 30×60 feed frame, the enlarged bold
explanation, the wider cards and CTA, `troco.net` attribution in all four
captions, and the complete 12-second vertical video. Confirm no text clipping,
collision, or brand distortion.

- [ ] **Step 5: Confirm repository hygiene**

Run:

```bash
git diff --check
git status --short --branch
```

Expected: only the pre-existing untracked `.DS_Store` remains; generated review
media stays ignored and no credentials or immutable scheduled campaign state
changed.
