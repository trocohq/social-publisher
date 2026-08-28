# Published Thumbnail Backfill Design

**Status:** Approved for implementation planning  
**Date:** 2026-08-28

## Goal

Apply the new deterministic Troco video cover to already-published content
without replacing a video, changing public copy, deleting a post, or losing
engagement. The backfill covers these immutable campaigns:

- `2026-08-27-quick-calculation-v1-0`;
- `2026-08-28-safe-checkout-v1-4`.

Each campaign has published Instagram, Facebook, and YouTube records. TikTok
was disabled for both campaigns and is outside the backfill.

## Scope

The implementation will:

- regenerate one 1080×1920 sRGB JPEG from each stored campaign plan;
- keep every existing campaign plan, render hash, media file, caption, and
  provider stage unchanged;
- update matching YouTube Shorts through an authenticated post-publication
  thumbnail operation;
- prepare and audit native Instagram and Facebook cover changes;
- use the authenticated native interfaces to change those Meta covers only
  when the account exposes a supported edit action;
- record every channel result independently and idempotently;
- fail closed on missing, ambiguous, or ineligible content.

The implementation will not:

- upload a replacement video;
- delete or republish content;
- alter captions, tags, audio, visibility, schedule, or audience settings;
- reinterpret a Buffer post identifier as a native social-network identifier;
- change the immutable campaign-state schema or its existing render hashes;
- include the separate future editorial expansion about fraud prevention.

## Chosen approach

The backfill is hybrid and audited. One repository command prepares deterministic
covers and controls YouTube writes. Instagram and Facebook use the native
authenticated interfaces because Buffer cannot edit a post after publication
and the repository has no verified post-publication Meta cover contract.

This approach preserves engagement while keeping provider assumptions explicit.
A fully manual workflow would not be repeatable or testable. Deleting and
reposting is rejected because it would discard engagement and change public
post identity.

## Architecture

### Candidate selection

A candidate selector loads one exact campaign by ID and verifies all of these
conditions before producing a backfill:

1. the campaign state passes the existing schema;
2. the requested campaign ID equals `state.plan.id`;
3. the requested channel is Instagram, Facebook, or YouTube;
4. the channel stage is `published`;
5. the campaign predates the new cover contract or has no successful record for
   the current thumbnail hash.

The CLI accepts one exact campaign per invocation. Running both historical
campaigns therefore requires two explicit invocations. Broad dates, globs, and
"all campaigns" execution are intentionally unsupported.

### Historical cover renderer

The renderer consumes the stored `CampaignPlan` and canonical Troco brand. It
calls the existing `createVerticalThumbnailSvg` and `renderVideoThumbnail`
functions directly. It does not call the full feed or video renderer, so it
cannot overwrite or challenge the immutable historical video hash.

The output is written below:

```text
.tmp/thumbnail-backfill/<campaign-id>/thumbnail.jpg
.tmp/thumbnail-backfill/<campaign-id>/review.json
.tmp/thumbnail-backfill/<campaign-id>/index.html
```

The renderer verifies 1080×1920 dimensions, JPEG format, sRGB color space, a
SHA-256 digest, and a maximum size of 2 MB. The 2 MB limit follows the YouTube
Data API upload contract and is stricter than the existing local review limit.

### YouTube resolver and updater

The existing YouTube OAuth access-token provider and upload-playlist
reconciliation are reused. The native YouTube video ID is discovered from the
campaign fingerprint tag created by `campaignTag(campaignId)`. Buffer's stored
provider ID is retained for audit context but is never sent to YouTube.

Resolution must return exactly one video. Zero matches produce `not_found`;
multiple matches are a permanent ambiguity and stop the operation. The matched
video must be public and belong to the authenticated channel.

The updater uploads the JPEG through YouTube Data API `thumbnails.set` for the
resolved video ID. A successful response must contain a thumbnail resource.
The updater then fetches the video resource and verifies that thumbnail metadata
is present. The audit records the native video ID, public permalink, thumbnail
hash, attempt time, and verification time. It never stores an access token or
raw provider response.

Official contracts:

- <https://developers.google.com/youtube/v3/docs/thumbnails/set>
- <https://support.google.com/youtube/answer/72431>

### Instagram and Facebook native workflow

The review page lists, for each Meta channel:

- the exact Troco account or Page;
- campaign date and ID;
- the existing Buffer provider ID;
- recognizable campaign copy;
- the generated JPEG and its hash;
- a checklist that forbids any edit beyond the cover.

The authenticated browser opens the native post and verifies the account,
campaign date, and copy before editing. The cover is saved only when the native
interface exposes an explicit cover or thumbnail control. The browser then
reopens the post or profile grid and confirms the visible cover.

If the control is absent, the channel is recorded as `unsupported`. If the post
cannot be identified exactly once, it is recorded as `not_found`. There is no
delete-and-repost fallback. Buffer is not used for these writes because its
published-post contract explicitly requires edits to happen on the social
network itself:

- <https://support.buffer.com/en-us/articles/understanding-sent-post-metrics-within-buffers-publish-dashboard-kppgBDLK6y>

### Audit storage

Backfill state is stored separately from immutable campaign state:

```text
state/thumbnail-backfills/<campaign-id>.json
```

Preparation does not create or modify this durable file. The document is
created atomically only when a YouTube execution is attempted or a verified
native outcome is recorded.

Each document uses its own versioned schema:

```json
{
  "schemaVersion": 1,
  "campaignId": "2026-08-27-quick-calculation-v1-0",
  "thumbnail": {
    "hash": "<sha256>",
    "width": 1080,
    "height": 1920,
    "format": "jpeg"
  },
  "channels": {
    "instagram": { "status": "pending", "attempts": 0 },
    "facebook": { "status": "pending", "attempts": 0 },
    "youtube": { "status": "pending", "attempts": 0 }
  }
}
```

Allowed channel statuses are `pending`, `updated`, `unsupported`, `not_found`,
and `failed`. A result may add a provider reference, sanitized error, attempt
timestamp, and verification timestamp. The schema rejects unknown keys and
secret-like values.

The successful key is the pair `(campaignId, thumbnail.hash)`. A repeated run
with the same hash skips any channel already marked `updated`. A different hash
for an existing successful record fails rather than silently replacing a cover.

## Command behavior

The package exposes `backfill-thumbnails` with these controlled modes:

1. **Prepare:** exact `--campaign`; generates and reviews the cover, but performs
   no provider write.
2. **Execute YouTube:** exact `--campaign`, `--channel youtube`, `--execute`, and
   an exact confirmation value matching the campaign ID.
3. **Record native outcome:** exact `--campaign`, Instagram or Facebook channel,
   one allowed outcome, and an exact confirmation value. This mode records an
   already-observed native result; it does not claim to perform the UI action.

Unknown flags, unsupported channels, missing confirmation, non-published
records, and attempts to address more than one campaign fail before rendering
or network access. JSON output remains concise and contains no credentials.

## Data flow

1. Load and validate one immutable campaign state.
2. Select one eligible published channel.
3. Render and verify the historical thumbnail from the stored plan.
4. Load any existing audit document or construct the candidate in memory.
5. Stop if the current campaign/hash/channel is already successful.
6. In prepare mode, write only ignored review artifacts and no durable state.
7. In YouTube execute mode, obtain OAuth, resolve one video, upload the cover,
   verify provider metadata, and atomically store `updated`.
8. In a Meta browser session, identify the exact native post, change only its
   cover when supported, verify the result, and then record the observed outcome.
9. Report each channel independently; one channel failure never rewrites a
   successful sibling.

## Failure and recovery

- Authentication failures are sanitized and recorded as `failed` without
  exposing credentials.
- Temporary YouTube network, quota, or server failures keep the operation safe
  to retry because success is recorded only after provider verification.
- A YouTube `403` caused by missing custom-thumbnail eligibility is `failed`,
  not `unsupported`, because the operation exists but the authenticated channel
  cannot use it.
- Missing or ambiguous provider matches never trigger a write.
- Atomic audit writes prevent partial JSON files.
- A browser interruption leaves the Meta channel `pending` until the visible
  result is known.
- Recording a manual outcome requires the thumbnail hash still to match the
  prepared artifact.

## Testing

Automated tests cover:

- exact candidate selection and rejection of non-published channels;
- deterministic historical rendering without a full video render;
- the 1080×1920 JPEG, sRGB, SHA-256, and 2 MB contracts;
- independent audit initialization and strict schema validation;
- immutable campaign bytes before and after preparation and audit writes;
- YouTube fingerprint resolution with zero, one, and multiple matches;
- the authenticated `thumbnails.set` request and sanitized failures;
- post-upload verification and stored native video identity;
- idempotent skips for an already-updated campaign/hash/channel;
- refusal to overwrite a successful record with a different hash;
- CLI dry-run defaults, exact execution gates, and concise output;
- independent sibling outcomes and atomic state writes;
- review-page content for the native Meta checklist.

The final operational verification regenerates both historical covers, runs the
complete quality gate, executes YouTube one campaign at a time, reviews Meta one
post at a time, and confirms that the original six post identities remain
unchanged.

## Separate editorial follow-up

Fraud-prevention content is a related product opportunity but a separate
project. After this backfill, a new brainstorming and specification cycle will
expand the editorial catalog with sourced, practical guidance about false Pix
receipts, altered payment details, duplicate-payment pressure, card-terminal
values, card substitution, and fake support links. It will not be bundled into
the provider-maintenance change described here.
