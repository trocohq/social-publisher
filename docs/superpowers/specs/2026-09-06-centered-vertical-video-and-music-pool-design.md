# Centered Vertical Video and Music Pool Design

## Goal

Update Troco's shared 1080×1920 short-form video so Instagram Reels and TikTok receive a composition whose complete visual stack is centered horizontally and vertically. Replace the single Enterprise soundtrack with the two approved tracks already used by the Openings social publisher: `Funked Up` and `Funky House`.

## Scope

- Change the vertical `short.mp4` used for Instagram Reels and TikTok.
- Keep feed and carousel images unchanged.
- Keep Facebook and YouTube publishing behavior unchanged.
- Preserve the existing 12-second video, four 3-second scenes, encoding contract, palettes, and copy.
- Use the canonical Troco mark from `frontend/public/brand/troco-mark.svg`; no placeholder, redrawn, or substitute logo is allowed.
- Reproduce the web brand lockup: a `22%` corner radius on the mark, followed by `Troco` in Figtree 700 with `-0.04em` letter spacing and proportional spacing between mark and word label.
- Store the two approved audio files under `assets/music/` with their source attribution and integrity hashes.

## Visual Layout

Each vertical scene will expose one content stack containing all visible elements for that scene: the canonical mark loaded from `frontend/public/brand/troco-mark.svg`, the `TROCO` word label, editorial label when present, primary message, supporting card or CTA, and progress indicator when present.

The renderer will calculate the stack's total height and place it at the vertical midpoint of the platform-safe area. Every stack item will use the canvas midpoint (`x = 540`) as its horizontal alignment axis. Text will be centered, cards and CTA surfaces will have equal left and right bounds, and internal value rows will remain readable while their containing card stays centered.

The stack must remain inside the safe area for Instagram Reels and TikTok overlays. Variable-length text will continue to use the existing fitting rules. If fitted content cannot fit within the available centered stack, rendering will fail with a clear layout error instead of clipping.

The video thumbnail uses the same centered layout contract as the hook scene so the cover and first video frame remain visually consistent.

## Color Variations

Each campaign selects one of seven official background colors from the shared design tokens and keeps it throughout all four scenes:

- `paper` (`#FEFDFB`)
- `ink` (`#213130`)
- `primary` (`#B0EC9C`)
- `purple` (`#E6DBFF`)
- `yellow` (`#FFD88A`)
- `blue` (`#ADDAFF`)
- `coral` (`#FFB2A8`)

The choice is derived deterministically from the campaign ID. This creates variation between campaigns without allowing a rerender to change the output.

The `ink` background uses `frontend/public/brand/troco-mark-inverse.svg` and Paper foreground text. All six light backgrounds use `frontend/public/brand/troco-mark.svg` and Ink foreground text. Supporting cards and CTAs use only the Ink/Paper pair required for strong contrast. Soft color variants are excluded to keep the set distinct and minimal.

Typography mirrors the web design system: Stolzl Regular for display headlines and Figtree Variable for the brand word label, supporting text, values, labels, and CTAs. The renderer embeds the same hash-verified files from `frontend/public/fonts/`.

## Music Selection

The soundtrack catalog contains exactly two entries:

- `funked-up`: `Funked Up` by Joth
- `funky-house`: `Funky House` by Of Far Different Nature

Selection will be pseudo-random and deterministic. A stable hash of the campaign ID chooses one of the two tracks, so campaigns appear to vary randomly while rerendering the same campaign produces identical media. The selected track supplies a validated 12-second excerpt and is recorded in the existing render result and dry-run review.

Both sources must pass digest, duration, channel-count, and sample-rate validation before rendering. The existing volume normalization, fades, limiter, AAC output, and 48 kHz stereo output remain unchanged.

## Components

- `src/render/music.ts`: define the two-track catalog, source metadata, validation, and campaign-ID-based selection.
- `src/render/video.ts`: request the selected soundtrack using `plan.id` and pass its file to FFmpeg.
- `src/render/svg.ts`: select the campaign color treatment, render the canonical lockup, and calculate centered vertical stacks without changing feed SVGs.
- `src/brand/load-brand.ts`: continue loading and integrity-checking the canonical frontend marks and fonts; the vertical renderer receives them through `BrandAssets`.
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
7. Every vertical scene embeds a hash-verified canonical mark with a `22%` corner radius and renders `Troco` in Figtree 700 with `-0.04em` letter spacing.
8. Every campaign selects one official background treatment from its campaign ID and uses it consistently across all scenes and its thumbnail.
9. The Ink treatment uses the inverse mark and Paper foreground; all light treatments use the regular mark and Ink foreground.
10. Display headlines use Stolzl Regular, while supporting and functional text uses Figtree Variable.
11. `npm run check` and `npm run validate` pass.
