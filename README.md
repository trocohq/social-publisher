# Troco Social Publisher

Troco Social Publisher creates one deterministic Brazilian Portuguese campaign
for each local day. A campaign contains reviewed copy for Instagram, Facebook,
TikTok, and YouTube; 1080×1350 feed or carousel images; and a 1080×1920 short
video with original generated audio.

This package is the reviewable content core. **No provider writes** happen in a
dry run or in the validation command. Provider delivery is a separate boundary
and remains disabled unless an operator explicitly enables it.

## Requirements

- Node.js 20.19.4 or newer. Node.js 24 is used by the current local toolchain.
- A read-only GitHub Packages token in `NODE_AUTH_TOKEN` for the Troco packages.
- FFmpeg and FFprobe. Locked static binaries are installed with the package;
  explicit binary paths may be supplied when diagnosing a local installation.
- The sibling `frontend/public` directory, containing the canonical brand files.

Install without writing a token to a tracked file:

```sh
NODE_AUTH_TOKEN="your-read-only-token" npm ci
```

Never commit `.env`, generated media, access tokens, refresh tokens, or provider
credentials.

## Safe local workflow

Run formatting checks, strict TypeScript, and the complete test suite:

```sh
npm run check
```

Build a local review bundle with the locked media binaries:

```sh
npm run dry-run -- \
  --date 2026-08-26 \
  --brand-root ../frontend/public \
  --output .tmp/review
```

To diagnose a machine-specific media installation, pass both paths explicitly:

```sh
npm run dry-run -- \
  --date 2026-08-26 \
  --brand-root ../frontend/public \
  --output .tmp/review \
  --ffmpeg /opt/homebrew/bin/ffmpeg \
  --ffprobe /opt/homebrew/bin/ffprobe
```

Open `.tmp/review/index.html` to inspect the final assets and channel copy. The
bundle also contains:

- `campaign.json`: the immutable plan and source identifiers;
- `captions.json`: the final attributed text for all four channels;
- `manifest.json`: dimensions, codecs, durations, hashes, and binary versions;
- `feed/slide-01.jpg` through `slide-05.jpg` when a carousel needs them;
- `video/short.mp4`: the H.264/AAC vertical video.

The command writes only inside the selected output directory. It creates no
publication state and performs no network request.

## Canonical brand assets

Canonical brand assets come from `frontend/public` and are verified against
reviewed SHA-256 hashes before rendering. The loader requires both Troco marks,
Stolzl, and Figtree. It rejects missing files, changed bytes, symlinks, unsafe
SVG content, and external SVG references. There is deliberately no fallback or
generated substitute for the Troco mark.

The reviewed manifest currently corresponds to frontend commit
`298381c8e6c3220cde11a8109ddb727a28223d7c`.

## Architecture and deterministic boundary

Planning is pure: a local date, publication time, and explicit history produce
an immutable campaign plan. Money stays in integer minor units and all results
come from `@trocohq/core`. Repository-owned facts include their source and
review date. Candidate selection blocks repeated scenarios, copy, palettes, and
calls to action within the configured windows.

Rendering consumes only a validated plan and verified brand bytes. Image output
is deterministic for the same Sharp runtime. Video timing, source scenes, PCM
audio samples, encoder arguments, and metadata are deterministic; binary
versions are recorded because byte-for-byte MP4 output can vary across FFmpeg
builds or operating systems.

Run the complete content and media validation in an isolated temporary folder:

```sh
npm run validate
```

The validation exits nonzero if facts, typography, brand hashes, image
dimensions, video codecs, duration, frame rate, or file-size limits fail.

## Current production status

Automated publication is active. Instagram `@trocohq`, Facebook `trocohq`, and
YouTube `@trocohq` use all three channel slots in Troco's free Buffer account.
TikTok `@trocofacil.app` remains disabled while authentication and a free
fourth-channel path are unresolved.

Activation snapshot from 2026-08-27:

- `AUTO_PUBLISH=true`;
- `YOUTUBE_PUBLICATION_VERIFIED=true` after a controlled public Short was
  reconciled against the exact Troco channel;
- `INSTAGRAM_ENABLED=true`, `FACEBOOK_ENABLED=true`, and
  `YOUTUBE_ENABLED=true`;
- `TIKTOK_ENABLED=false`;
- six posts scheduled per active channel for 2026-08-28 through 2026-09-02;
- 18 scheduled provider posts in total;
- TikTok stored as terminal `skipped_disabled`, with no provider request.

Queue counts above are a dated activation snapshot, not live metrics. Campaign
state under `state/campaigns/` is the durable audit record.

## Schedule and publishing volume

GitHub Actions runs the serialized publisher at minute 17 of every third UTC
hour (`17 */3 * * *`): nominally 00:17, 03:17, 06:17, 09:17, 12:17, 15:17,
18:17, and 21:17 UTC. GitHub may delay a scheduled start. This cadence is a
health, reconciliation, and queue-refill loop; it does not create eight new
campaigns per day.

Every campaign is due at 12:17 in `America/Sao_Paulo`. The planner maintains D
through D+6 and never backfills an earlier local date. At steady state, the
target volume is:

| Measure                 | Per active channel | Three active channels |
| ----------------------- | -----------------: | --------------------: |
| Campaigns per day       |                  1 |     1 shared campaign |
| Provider posts per day  |                  1 |                     3 |
| Provider posts per week |                  7 |     21 provider posts |
| Maximum planned queue   |                  7 |                    21 |

## Weekly editorial rotation

| Day       | Campaign family    | Instagram and Facebook output |
| --------- | ------------------ | ----------------------------- |
| Monday    | Change challenge   | Reel                          |
| Tuesday   | Cashier shortcut   | Four-slide carousel           |
| Wednesday | Troco explains     | Single feed image             |
| Thursday  | Quick calculation  | Reel                          |
| Friday    | Safe checkout      | Four-slide carousel           |
| Saturday  | Checkout situation | Reel                          |
| Sunday    | Save this rule     | Single feed image             |

Every active day also produces one public YouTube Short. Copy is written in
Brazilian Portuguese around change calculations, cashier routines, checkout
safety, practical scenarios, and product education. Each channel receives its
own Google Play URL with `utm_source`, `utm_medium`, `utm_campaign`, and
`utm_content`.

The renderer rotates the official green, blue, yellow, and purple palettes. A
palette deterministically selects one original generated 100 BPM arrangement:
warm, airy, bright, or pulse. The same campaign always produces the same visual
and audio choice.

## What the workflow does

For scheduled or controlled execution, the workflow:

1. loads the canonical frontend brand assets and shared design tokens at pinned
   commits;
2. plans the D through D+6 campaign window and renders any missing media;
3. validates copy, amounts, typography, brand hashes, images, video, and audio;
4. commits sanitized campaign state before and after each external action;
5. publishes verified rolling media to GitHub Pages and verifies the served
   bytes;
6. checks the Buffer organization, exact channels, queue capacity, and public
   media before scheduling;
7. reconciles channel, due time, normalized copy, and ordered media to avoid
   duplicates;
8. creates one isolated provider action at a time and records its provider ID;
9. reconciles active intents, verifies publication health, and opens or closes
   one sanitized GitHub incident when required.

Overdue work is sent immediately instead of being scheduled in the past.
Retryable work expires when the São Paulo day changes, so missed dates are not
backfilled.

## Formats, capacity, and retention

- Feed and carousel media: deterministic 1080×1350 sRGB JPEG.
- Reels and Shorts: 1080×1920 H.264/AAC MP4 with on-screen meaning preserved
  when muted.
- Buffer Free capacity used by this design: three connected channels and ten
  queued posts per channel.
- The seven-day rolling window uses at most seven queue slots per active
  channel.
- GitHub Pages retains media only from D−2 through D+7; tracked sanitized state
  remains available for audits and repetition checks.

Scheduled writes require `AUTO_PUBLISH=true`. YouTube additionally requires
`YOUTUBE_PUBLICATION_VERIFIED=true`. Channel flags keep Instagram, Facebook,
and YouTube enabled and TikTok disabled. See the
[operations runbook](docs/operations.md) for activation, emergency stops,
retries, incidents, and token rotation.

## Remaining work

- Resolve TikTok authentication. Because all three Buffer Free channel slots
  are occupied, an all-free TikTok path also needs a separate free integration
  or a deliberate channel replacement before controlled verification.
- Run and review the initial seven days of real publication across Instagram,
  Facebook, and YouTube, including provider delivery after each due time.
- Review Google Play acquisition manually using the channel-specific UTM links.
  Automatic Play Console ingestion and attribution export are not implemented.
- Periodically review editorial facts, copy quality, palette and music rotation,
  Buffer limits, and provider contracts as external platforms change.
