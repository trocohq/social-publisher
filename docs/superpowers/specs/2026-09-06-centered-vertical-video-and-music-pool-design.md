# Centered Vertical Video and Music Pool Design

## Goal

Update Troco's shared 1080×1920 short-form video so Instagram Reels and TikTok receive a composition whose complete visual stack is centered horizontally and vertically. Replace the single Enterprise soundtrack with the two approved tracks already used by the Openings social publisher: `Funked Up` and `Funky House`.

## Scope

- Change the vertical `short.mp4` used for Instagram Reels and TikTok.
- Keep feed and carousel images unchanged.
- Keep Facebook and YouTube publishing behavior unchanged.
- Preserve the existing 12-second video, four 3-second scenes, encoding contract, brand assets, palettes, and copy.
- Store the two approved audio files under `assets/music/` with their source attribution and integrity hashes.

## Visual Layout

Each vertical scene will expose one content stack containing all visible elements for that scene: brand identification, editorial label when present, primary message, supporting card or CTA, and progress indicator when present.

The renderer will calculate the stack's total height and place it at the vertical midpoint of the platform-safe area. Every stack item will use the canvas midpoint (`x = 540`) as its horizontal alignment axis. Text will be centered, cards and CTA surfaces will have equal left and right bounds, and internal value rows will remain readable while their containing card stays centered.

The stack must remain inside the safe area for Instagram Reels and TikTok overlays. Variable-length text will continue to use the existing fitting rules. If fitted content cannot fit within the available centered stack, rendering will fail with a clear layout error instead of clipping.

The video thumbnail uses the same centered layout contract as the hook scene so the cover and first video frame remain visually consistent.

## Music Selection

The soundtrack catalog contains exactly two entries:

- `funked-up`: `Funked Up` by Joth
- `funky-house`: `Funky House` by Of Far Different Nature

Selection will be pseudo-random and deterministic. A stable hash of the campaign ID chooses one of the two tracks, so campaigns appear to vary randomly while rerendering the same campaign produces identical media. The selected track supplies a validated 12-second excerpt and is recorded in the existing render result and dry-run review.

Both sources must pass digest, duration, channel-count, and sample-rate validation before rendering. The existing volume normalization, fades, limiter, AAC output, and 48 kHz stereo output remain unchanged.

## Components

- `src/render/music.ts`: define the two-track catalog, source metadata, validation, and campaign-ID-based selection.
- `src/render/video.ts`: request the selected soundtrack using `plan.id` and pass its file to FFmpeg.
- `src/render/svg.ts`: calculate and render centered vertical stacks without changing feed SVGs.
- `assets/music/`: contain the approved source audio and attribution documentation.
- Tests: cover deterministic music selection, both-track reachability, source integrity, centered stack bounds, thumbnail consistency, and unchanged output contracts.

## Failure Handling

Rendering stops before publishing when an audio source is missing, has a digest mismatch, fails its media probe, or a visual stack escapes the safe area. Error messages identify the invalid source or scene without exposing local filesystem details in persisted campaign state.

## Acceptance Criteria

1. Instagram Reels and TikTok continue to share one valid 1080×1920, 12-second `short.mp4`.
2. Every scene's complete visual stack is horizontally and vertically centered within the vertical safe area.
3. The hook frame and generated thumbnail use the same centered geometry.
4. Each campaign selects either `funked-up` or `funky-house` from its campaign ID, and rerenders select the same track.
5. A representative set of campaign IDs reaches both tracks.
6. Feed/carousel rendering and non-video publishing contracts do not change.
7. `npm run check` and `npm run validate` pass.
