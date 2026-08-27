# Troco Palette and Music Rotation Design

**Date:** 2026-08-27  
**Status:** Approved direction, awaiting written-spec review

## Goal

Give consecutive Troco posts visible and audible variety without weakening brand
recognition. Every post uses one official Troco background color and one matching
arrangement of the same original musical identity.

## Decisions

- Use only the existing `green`, `blue`, `yellow`, and `purple` palette tokens.
- Keep the current deterministic palette selection and repetition guard.
- Associate one musical arrangement with each palette.
- Keep the same harmony, tempo, cue timing, short melodic signature, duration,
  and overall loudness across all arrangements.
- Derive the arrangement from the persisted campaign palette. Regenerating a
  campaign therefore produces the same image, video, and music without adding a
  second selection field to the campaign schema.
- Keep all music procedural and original. Do not download or embed third-party
  tracks, samples, or loops.

## Audiovisual System

| Troco palette | Arrangement | Character | Primary change |
| --- | --- | --- | --- |
| Green | `warm` | Welcoming and steady | Warmer pad and rounded pluck |
| Blue | `airy` | Light and clear | Wider pad and more open high notes |
| Yellow | `bright` | Cheerful and energetic | Stronger percussion and melodic accent |
| Purple | `pulse` | Rhythmic and modern | More active bass pulse and electronic pluck |

These are arrangements of one identity, not four unrelated tracks. They share:

- 100 BPM;
- the existing five-bar harmonic progression;
- the existing 12-second structure and scene-change cues at 3, 6, and 9 seconds;
- the same core melodic motif;
- stereo output at 48 kHz and 16-bit source precision;
- the same soft limiter and peak ceiling.

Differences come from voice balance, stereo placement, articulation, percussion,
and small motif variations. Tempo, harmony, and cue positions do not change.

## Selection and Data Flow

1. Campaign planning selects an official palette from the seeded campaign data.
2. Existing history rules reject a candidate that repeats the immediately
   preceding palette.
3. The immutable campaign plan persists that palette.
4. Image and scene rendering use the palette's official background token.
5. Video rendering maps the same palette to its musical arrangement.
6. Audio generation renders the selected arrangement deterministically.

No randomness may depend on wall-clock time, process state, or the machine. The
same campaign plan must always produce identical audio bytes and an identical
video hash on the supported runtime.

## Implementation Boundaries

- Add an explicit `MusicVariant` contract and exhaustive palette-to-variant map
  in the audio-rendering boundary.
- Pass the campaign palette from `renderVideo` into `createToneBed`.
- Keep the shared composition in one implementation. Arrangement configuration
  changes voice parameters rather than duplicating four synthesizers.
- Preserve the current `CampaignPlan` schema because palette already provides
  the immutable selection required for replay and audit.
- Do not change captions, publishing providers, schedules, credentials, or
  activation gates.

## Audio Safety and Failure Behavior

Every arrangement must pass the existing media contract and fail locally before
publication if it does not. The renderer rejects unknown variants. Generated
audio must contain:

- two meaningfully different stereo channels;
- a clear 100 BPM pulse;
- no samples at or above the `0.18` ceiling;
- no NaN, infinity, or denormal values after video encoding;
- enough level to remain audible without dominating the visual post.

All arrangements use the shared soft limiter. Individual voice gains may be
balanced per arrangement, but none may bypass the limiter or introduce a hard
clamp.

## Testing

Tests will cover:

- exhaustive mapping of all four official palettes;
- byte-for-byte determinism for each arrangement;
- distinct audio hashes for the four arrangements;
- stereo, sample-rate, pulse, RMS, peak, and saturation checks for every variant;
- a video-render test proving the campaign palette reaches audio generation;
- a multi-day campaign sweep proving normal planning does not repeat a palette
  on consecutive posts when history is supplied;
- the existing complete rendering, workflow, and validation suites.

The final review bundle will include four 12-second videos generated from the
same campaign content, one per official palette, so color and music pairing can
be inspected together before any external activation.

## Completion Criteria

- All four official background colors render correctly.
- Every color selects its documented arrangement.
- Consecutive planned posts do not repeat the same pairing.
- Re-rendering a campaign is deterministic.
- All audio and video safety checks pass.
- The four-variant review bundle is visually and audibly inspected.
- The working tree is clean, changes are split into micro-commits, and nothing is
  pushed or published.
