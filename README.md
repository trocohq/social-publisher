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

## Automated delivery

The production boundary stores a sanitized campaign state before and after each
external action. GitHub Pages serves the verified rolling media. Buffer
schedules Instagram, Facebook, and TikTok; YouTube receives the local MP4 using
an OAuth resumable upload. Every execution reconciles the campaign fingerprint,
channel, due time, normalized copy, and ordered media before it creates
anything.

Each channel receives its own Google Play URL with `utm_source`, `utm_medium`,
`utm_campaign`, and `utm_content`. Download growth is evaluated manually in
Google Play Console. Automatic Play Console ingestion, attribution export, and
credential access are explicitly outside this repository.

Scheduled writes are serialized and disabled unless the repository variable
`AUTO_PUBLISH` is exactly `true`. Start with the future controlled campaign and
private YouTube verification described in the
[operations runbook](docs/operations.md). Never activate unattended publishing
from code completion alone.
