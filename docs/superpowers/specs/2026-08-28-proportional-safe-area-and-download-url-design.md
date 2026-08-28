# Proportional Safe Area and Download URL Design

**Date:** 2026-08-28
**Status:** Approved for implementation

## Goal

Improve the readability and consistency of every generated Troco social asset
by applying a proportional outer safe area, strengthening explanatory copy, and
using `https://troco.net` as the canonical app-download destination.

## Scope

This change applies to:

- 1080×1350 feed images;
- every slide in carousel campaigns;
- every 1080×1920 vertical-video scene;
- channel captions and review output that contain the app-download URL;
- renderer and environment contracts that name or validate that URL.

It does not change editorial facts, campaign selection, publication timing,
provider authentication, or the deterministic palette and music rotation.

## Proportional safe area

The approved 1080×1350 reference uses 30 pixels horizontally and 60 pixels
vertically. The renderer derives margins from the canvas rather than repeating
format-specific constants:

- horizontal ratio: `30 / 1080`;
- vertical ratio: `60 / 1350`.

Margins are rounded to the nearest whole pixel. This produces:

| Canvas | Horizontal margin | Vertical margin |
| --- | ---: | ---: |
| 1080×1350 feed or carousel | 30 px | 60 px |
| 1080×1920 vertical video | 30 px | 85 px |

The safe area is the minimum outer boundary. Cards, buttons, and text groups
retain their own internal padding so content never appears attached to a
container edge. Headers, labels, counters, primary copy, scenario cards, and
calls to action must all remain inside the derived outer rectangle.

## Visual hierarchy

The hierarchy remains:

1. campaign headline;
2. purchase, received amount, and answer;
3. explanatory copy;
4. call to action.

Explanatory copy such as “O Troco oferece cálculo em real brasileiro, dólar
americano e euro.” becomes a deliberate third-level headline instead of muted
body text. It uses Figtree at weight 700, a larger responsive type range, and a
tighter line height. Feed output should target approximately 50–54 pixels while
still using deterministic text fitting for longer reviewed copy. Carousel and
vertical end-card explanations receive the same strong weight and a
format-appropriate size range.

The renderer may enlarge containers to use the wider safe-area grid, but it
must preserve clear internal spacing and avoid collisions between the
explanation, scenario card, and call to action.

## Canonical app-download URL

`https://troco.net` replaces the direct Google Play listing as the canonical
download destination. Generated captions continue to append deterministic UTM
parameters for the destination channel and campaign. Visible artwork uses the
short `troco.net` form.

Configuration and documentation should use the provider-neutral name
`APP_DOWNLOAD_URL`. The publication workflow must receive the reviewed HTTPS
origin without exposing credentials. A temporary compatibility fallback for
the old `PLAY_STORE_URL` name is acceptable only if required to avoid breaking
an already-configured workflow, and it must not change the generated URL.

## Implementation boundaries

- Define the proportional safe-area calculation in one renderer module.
- Reuse the resulting frame across feed, carousel, and vertical SVG builders.
- Keep output dimensions, codecs, color space, brand assets, and determinism
  unchanged.
- Keep generated JPEG, MP4, HTML, and review artifacts outside Git.
- Do not add runtime network calls or paid services.

## Verification

Automated coverage must prove that:

- the safe-area calculation returns 30×60 for 1080×1350 and 30×85 for
  1080×1920;
- representative feed, carousel, and vertical SVG elements stay within their
  derived outer boundaries;
- explanatory copy renders with Figtree weight 700 and the approved larger
  type range;
- every generated acquisition link uses the `troco.net` HTTPS origin and keeps
  the expected channel UTM parameters;
- existing deterministic image, video, audio, editorial, state, and publishing
  contracts continue to pass.

After automated verification, regenerate the local review bundle and inspect
the image and all four vertical-video scenes in the browser at their real
aspect ratios.
