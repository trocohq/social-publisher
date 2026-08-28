# Video Thumbnail Design

**Date:** 2026-08-28

**Status:** Approved for implementation planning

**Scope:** Give every newly generated vertical video a deliberate, deterministic
cover that remains recognizable across social-network crops.

## Context

Troco's 12-second vertical videos currently use the first three-second hook
scene as their effective cover. Buffer requests a frame at two seconds for
Instagram, Facebook, and TikTok, while the current YouTube contract supplies
only the video. The hook scene places the brand header at the top, the main
message below it, and the call to action near the bottom. At thumbnail size,
those separated anchors create excessive empty space and weaken the visual
relationship between brand, challenge, and action.

The approved visual direction uses one compact composition centered vertically:
brand header, challenge message, and call to action form a single stack. The
header and call to action each sit exactly 40 pixels from the message block.

## Goals

- Make the cover understandable in less than one second on a phone.
- Preserve curiosity by showing the transaction values without revealing the
  answer.
- Keep the complete essential composition visible in centered 9:16, 4:5, and
  square crops.
- Make the dedicated cover and the frame selected at two seconds visually
  identical.
- Preserve Troco's canonical mark, fonts, official palettes, and proportional
  safe margins.
- Generate every cover deterministically without external services or paid
  dependencies.

## Non-goals

- Creating a different visual system for each social network.
- Adding photography, illustration, stock media, or AI-generated imagery.
- Retrofitting immutable campaigns that have already been scheduled or
  published.
- Adding a new provider mutation for APIs that do not currently accept an
  uploaded cover through the repository's verified contract.
- Revealing the calculated answer on the cover.

## Considered approaches

### 1. Redesign only the existing hook scene

This is the smallest change and improves the frame Buffer selects at two
seconds. It does not produce a reviewable cover artifact and leaves no explicit
thumbnail contract for future provider support.

### 2. Dedicated cover plus an identical opening scene

This is the approved approach. One source SVG produces a 1080×1920 JPEG cover
and the opening video scene. The visual remains static through the frame chosen
at two seconds. The dedicated JPEG is exposed in local review artifacts, while
the video remains the only provider media URL under the current Buffer
contract.

### 3. Separate cover per network

This offers platform-specific tuning but multiplies rendering, review, public
media, state, and reconciliation contracts. The added complexity is not
justified while all channels can share one crop-safe vertical composition.

## Visual contract

The cover is a 1080×1920 sRGB JPEG using the campaign's official Troco palette.
Its essential content is one vertically centered stack with three sections:

1. **Header:** canonical mark and `TROCO` on the left; campaign-family pill on
   the right.
2. **Message:** the kicker `FAÇA A CONTA` followed by the short transaction
   question.
3. **Call to action:** an ink-colored band containing `DESCUBRA NO VÍDEO` and
   `12s →`.

The stack uses exactly 40 pixels between the header and message, and exactly 40
pixels between the message and call to action. Internal spacing inside the
message remains separate from those two contract gaps.

The existing proportional 30-pixel horizontal reference margin remains the
outer frame. All essential elements must also fit inside the centered square
crop-safe region from `y=420` through `y=1500`. This region is stricter than the
general vertical safe area and keeps the complete stack visible when a social
feed crops the 9:16 video preview to 1:1. A centered 4:5 crop contains the same
region with additional vertical room.

The hierarchy is intentionally limited:

- the question is the largest element;
- transaction values remain part of the question rather than a second card;
- the brand and family label establish trust without competing with the hook;
- the CTA closes the stack and communicates the 12-second commitment;
- no slide counter appears on the cover.

## Thumbnail copy

Thumbnail copy is derived only from the validated integer-money scenario. It
does not reuse the longer editorial headline because that copy is allowed to
carry context that is too dense for a cover.

For a transaction with change, the question is:

`R$ {received} para pagar R$ {purchase}. Quanto volta?`

For an exact-payment scenario, the question is:

`R$ {received} para pagar R$ {purchase}. Tem troco?`

Values use the existing BRL formatter and Brazilian punctuation. The copy
builder is pure and rejects any result that cannot fit the approved thumbnail
layout above its minimum type size. It never includes the answer, explanation,
URL, hashtags, or platform-specific caption text.

## Rendering architecture

The implementation separates four responsibilities:

- `createThumbnailCopy(plan)` produces the short, deterministic question.
- `createVerticalThumbnailSvg({ plan, brand })` owns the complete cover layout.
- `renderVideoThumbnail(...)` writes and probes the review JPEG.
- `renderVideo(...)` renders the same SVG as its first three-second scene before
  the existing scenario, answer, and end-card scenes.

The thumbnail SVG is the single source of truth. The video renderer must not
reconstruct or approximate the cover using a separate layout.

The video remains 1080×1920, H.264/AAC, 30 fps, and 12 seconds. The opening
scene remains static for three seconds, so Buffer's existing two-second offset
lands on the approved composition. Enterprise excerpt selection and audio
filters remain unchanged.

## Artifact and provider behavior

Rendering writes `video/thumbnail.jpg` beside `video/short.mp4`. The thumbnail
is a generated artifact and remains outside Git. The rendered video result and
dry-run manifest expose the thumbnail path, SHA-256 digest, dimensions, and
format. The local review displays the cover immediately before the video player.

The current verified Buffer input continues to send exactly one video URL.
Instagram, Facebook, and TikTok retain `thumbnailOffset: 2000`; that frame is
identical to the dedicated cover. The repository does not claim that Buffer
uploads `thumbnail.jpg` where its current input contract has no thumbnail-file
field. YouTube receives the improved opening frame, but explicit YouTube
thumbnail upload remains outside this change because it requires a separate
post-publication provider contract.

The dedicated JPEG establishes a provider-ready source for that future contract
without weakening or guessing the current API boundary.

## Data flow

1. The planner supplies a validated campaign plan and canonical brand assets.
2. The thumbnail copy builder formats the transaction question.
3. The thumbnail SVG builder fits the question and calculates the centered
   three-section stack.
4. The image renderer writes `thumbnail.jpg` from that SVG and verifies its
   media contract.
5. The video renderer converts the same SVG into the first scene and completes
   the remaining three scenes with the existing Enterprise excerpt.
6. The dry-run manifest records thumbnail provenance and the review page shows
   the cover beside the video metadata.
7. Publication keeps the existing single-video provider contract and selects
   the approved frame at two seconds where supported.

## Failure behavior

Rendering fails closed when:

- scenario values cannot produce valid thumbnail copy;
- the question does not fit above the approved minimum type size;
- the computed stack escapes the centered square crop-safe region;
- either 40-pixel section gap changes;
- the JPEG is not 1080×1920 sRGB or exceeds the existing image-size limit;
- the first scene and thumbnail are not generated from the same SVG bytes.

There is no alternate layout, substitute logo, reduced safe margin, or silent
fallback. Provider publication cannot begin when the corresponding video render
fails.

## Existing campaign immutability

The redesigned first scene changes the video hash. Campaigns that already hold
immutable render hashes continue through the existing public-media restoration
path and keep their published videos. Only newly created campaign state receives
the new opening scene and thumbnail artifact.

The dedicated thumbnail is review metadata under this design, not a new durable
provider asset in existing campaign state. This avoids a state-schema migration
for campaigns that cannot be rewritten.

## Test strategy

Automated tests will cover:

- deterministic copy for change and exact-payment scenarios;
- absence of answer, URL, hashtags, and caption text from the cover;
- exact 40-pixel gaps around the message block;
- complete stack containment inside `x=30..1050` and `y=420..1500`;
- minimum type size and worst-case BRL values;
- canonical mark, Troco fonts, family label, CTA, and official palette;
- deterministic 1080×1920 sRGB JPEG output and SHA-256 digest;
- identical SVG input for the JPEG and first video scene;
- the approved cover present at the existing two-second provider offset;
- thumbnail metadata and preview in the dry-run review;
- unchanged H.264/AAC, duration, music excerpt, and provider media-count
  contracts;
- immutable campaign restoration when the new renderer changes a historical
  video hash.

The complete `npm run check` and `npm run validate` gates remain required. A
fresh review will inspect the dedicated cover and frames at zero and two seconds
to confirm visual identity.

## Acceptance criteria

- Every newly generated video has a deterministic `thumbnail.jpg` and a first
  scene rendered from the same SVG.
- The approved header, message, and CTA form one vertically centered stack with
  40-pixel section gaps.
- The complete essential composition survives centered square and 4:5 crops.
- The cover communicates the transaction and question without revealing the
  answer.
- Buffer's two-second thumbnail frame matches the dedicated JPEG visually.
- Existing campaign state, published media, music behavior, and single-video
  provider inputs remain valid.
- No network request, paid dependency, generated media binary, or substitute
  brand asset is introduced into Git.
