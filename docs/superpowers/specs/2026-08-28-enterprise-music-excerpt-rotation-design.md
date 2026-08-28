# Enterprise Music Excerpt Rotation Design

**Date:** 2026-08-28  
**Status:** Approved for implementation planning  
**Scope:** Replace procedural video music with deterministic excerpts from the
provided Enterprise track.

## Context

Troco's social videos currently use one of four procedural arrangements chosen
from the campaign palette. The project owner supplied `Enterprise (No Copyright
Music).mp3` and confirmed that Troco may use it commercially, include it in the
public repository, and publish it without attribution.

The source is a 134.191-second stereo MP3 at 44.1 kHz. It has no embedded title,
artist, copyright, or attribution metadata. Its measured integrated loudness is
-16.3 LUFS, its measured true peak is +0.5 dBFS, and its final detected silence
begins at 130.712 seconds. The renderer must attenuate the source and avoid the
silent tail.

## Goals

- Use the supplied Enterprise track in every newly generated vertical video.
- Vary the excerpt between videos without making rendering random.
- Prevent consecutive campaign dates from using the same excerpt.
- Preserve the existing deterministic media contract: the same campaign always
  produces the same audio selection and encoded video.
- Record enough excerpt metadata for review and operational diagnosis.
- Fail closed when the approved source asset is missing or altered.

## Non-goals

- Selecting music from external providers or downloading audio at runtime.
- Generating, remixing, or extending the supplied music with AI.
- Retrofitting or rewriting immutable campaigns that are already scheduled or
  published.
- Synchronizing scene transitions to detected beats.
- Keeping the four existing procedural arrangements as a silent fallback.

## Approved approach

The publisher stores the approved source as `assets/music/enterprise.mp3` and
defines nine curated, non-overlapping 12-second excerpts:

| Excerpt         | Start |   End |
| --------------- | ----: | ----: |
| `enterprise-01` |   2 s |  14 s |
| `enterprise-02` |  16 s |  28 s |
| `enterprise-03` |  30 s |  42 s |
| `enterprise-04` |  44 s |  56 s |
| `enterprise-05` |  58 s |  70 s |
| `enterprise-06` |  72 s |  84 s |
| `enterprise-07` |  86 s |  98 s |
| `enterprise-08` | 100 s | 112 s |
| `enterprise-09` | 116 s | 128 s |

The two-second spacing between windows reduces perceptual repetition while
keeping every excerpt away from the silent tail. Each 12-second excerpt matches
the existing four-scene video duration exactly.

## Selection and determinism

A pure selector converts the campaign's validated ISO local date to a stable
calendar-day ordinal and selects `ordinal mod 9`. Consecutive dates therefore
advance through the excerpt list without repetition, and the nine-excerpt cycle
repeats only after nine days.

The campaign palette continues to control only Troco's approved background
colors. Music selection no longer depends on palette, campaign family, process
state, or runtime randomness.

The selected excerpt is represented as an immutable value containing:

- `id`, such as `enterprise-05`;
- `startSeconds`;
- `durationSeconds`, always 12.

This value replaces the procedural `musicVariant` result in render and review
contracts.

## Source integrity

The approved MP3 is a source asset, not generated output. It may be committed to
the public repository under the authorization recorded in this specification.
Generated WAV and MP4 files remain ignored.

The renderer validates the source file against the committed SHA-256 digest
`d3884500099f06adc74583242056be7249f7758c4d1919efc6de3ccdf468029e`
before using it. It also verifies through the existing media binaries that the
source:

- contains an audio stream;
- is stereo;
- is long enough to contain the final excerpt;
- matches the approved digest.

A missing file, digest mismatch, invalid stream, or insufficient duration stops
rendering with a sanitized error. There is no procedural or silent fallback.

## Rendering data flow

1. The campaign planner supplies the campaign local date to the video renderer.
2. The excerpt selector returns the immutable excerpt for that date.
3. The renderer verifies the approved Enterprise source once for the render.
4. FFmpeg trims the exact excerpt and resets its timestamps.
5. The audio filter applies:
   - a 0.35-second fade-in;
   - a 0.65-second fade-out beginning at 11.35 seconds;
   - attenuation with `volume=0.70`;
   - a safety limiter configured as
     `alimiter=limit=0.88:attack=5:release=50:level=false`.
6. FFmpeg converts the excerpt to 48 kHz stereo AAC at 128 kbps while encoding
   the existing 1080×1920, 12-second H.264 video.
7. The renderer returns the excerpt metadata with the media hash and probe.
8. The dry-run manifest and review expose the excerpt ID, start, and duration.

All external-process arguments remain arrays. The renderer does not write the
trimmed excerpt as a durable file and does not make network requests.

## Existing campaign immutability

Tracked campaigns that already have render hashes remain immutable. Planning may
detect that current code would produce a different video, but the existing
restoration path must keep their previously verified public media and hashes.
Only newly created campaign state receives Enterprise-backed video media.

## Documentation changes

The README will describe the single approved Enterprise source and deterministic
nine-excerpt rotation instead of the four procedural arrangements. The
operations runbook will tell reviewers to verify the excerpt identifier and
listen for clean fades, appropriate level, and absence of clipping.

## Test strategy

Automated tests will cover:

- all nine excerpt definitions and their 12-second bounds;
- deterministic selection for the same local date;
- different selections for consecutive dates;
- the complete nine-day rotation;
- rejection of malformed dates;
- approved MP3 digest and stream metadata;
- failure for missing, changed, or too-short source audio;
- a deterministic 12-second H.264/AAC render with 48 kHz stereo audio;
- excerpt metadata in the video result, manifest, and dry-run review;
- workflow and package contracts that ensure the source asset is available in
  local and CI rendering.

The complete `npm run check` and `npm run validate` gates remain required. A
fresh dry-run video will be inspected at the beginning, middle, and end to
confirm audible continuity, fades, and the absence of layout regressions.

## Acceptance criteria

- Every newly rendered social video uses the supplied Enterprise MP3.
- Consecutive campaign dates use different 12-second excerpts.
- Re-rendering the same campaign produces the same excerpt metadata and video
  hash in the same supported runtime.
- Audio ends with a clean fade before the video ends and remains below clipping.
- Review artifacts identify the selected excerpt without exposing local paths.
- No runtime network dependency, procedural fallback, credential, or generated
  media binary is introduced into Git.
