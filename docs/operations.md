# Social Publisher Operations

This runbook controls the one-time setup, activation, monitoring, and recovery
of Troco's automated social publication. Keep `AUTO_PUBLISH=false` and
`YOUTUBE_PUBLICATION_VERIFIED=false` until every corresponding activation check
below has passed. Code completion alone does not authorize an unattended post.

## One-time account and repository setup

Complete these steps in order.

1. Create the public `trocohq/social-publisher` repository from this source.
   Enable GitHub Actions and GitHub Pages with **GitHub Actions** as its source.
   Set the Pages origin to `https://trocohq.github.io/social-publisher` unless a
   reviewed custom HTTPS origin is used.
2. Use the free Buffer account owned by Troco with Instagram `@trocohq`,
   Facebook `trocohq`, and YouTube `@trocohq` connected. These are the three
   free channel slots. TikTok `@trocofacil.app` remains explicitly disabled
   while its authentication is unresolved.
3. Record the Buffer organization ID and all three active Buffer channel IDs.
   Also record the external YouTube channel ID so preflight can prove that the
   Buffer connection belongs to `@trocohq`. `BUFFER_TIKTOK_CHANNEL_ID` may
   remain blank while TikTok is disabled. Keep the personal Buffer API key in
   the repository secret store only; never copy it into a local file, issue,
   workflow log, or campaign state.
4. Add these repository variables:

   - `AUTO_PUBLISH=false`
   - `YOUTUBE_PUBLICATION_VERIFIED=false`
   - `INSTAGRAM_ENABLED=true`
   - `FACEBOOK_ENABLED=true`
   - `TIKTOK_ENABLED=false`
   - `YOUTUBE_ENABLED=true`
   - `PAGES_ORIGIN`
   - `BUFFER_ORGANIZATION_ID`
   - `BUFFER_INSTAGRAM_CHANNEL_ID`
   - `BUFFER_FACEBOOK_CHANNEL_ID`
   - `BUFFER_TIKTOK_CHANNEL_ID` may be blank while TikTok is disabled
   - `BUFFER_YOUTUBE_CHANNEL_ID`
   - `YOUTUBE_CHANNEL_ID`

   The non-secret download destination is fixed in the workflow as
   `APP_DOWNLOAD_URL=https://troco.net`. Keep this provider-neutral URL intact
   so the website can route visitors to the appropriate app download while the
   publisher adds channel and campaign attribution.

5. Add these repository secrets:

   - `PACKAGES_READ_TOKEN` for read-only GitHub Packages access;
   - `SOURCE_READ_TOKEN` for read-only canonical source checkouts;
   - `BUFFER_API_KEY`.

   GitHub supplies the workflow token. Do not create a broad personal token for
   state commits or incident issues.

6. Verify that the frontend checkout is exactly
   `298381c8e6c3220cde11a8109ddb727a28223d7c` and the design-token checkout is
   exactly `1fefd27a0de14a8d4115fe79c6076a3b17d3cf6d`. Brand hashes and the packaged
   token source must match those reviewed commits.

Each campaign ID makes a deterministic two-track choice between **Funked Up** by
Joth and **Funky House** by Of Far Different Nature. Both CC0-1.0 OpenGameArt
sources are listed with their attribution, license, and source links in
`assets/music/README.md`. Each 9-second source loops and trims to 12 seconds.
Changing either source is a reviewed source change: update its approved SHA-256
contract, run the full media validation, and apply the new audio only to future
campaigns. Never rewrite immutable scheduled or published campaign hashes.

## Centered vertical campaign review

The campaign ID also selects one of seven official background treatments—Paper,
Ink, Primary, Purple, Yellow, Blue, or Coral—once for the campaign and reuses it
for all four scenes and the thumbnail. Ink uses the canonical inverse mark;
Paper uses the canonical normal mark. The color treatments use the canonical
normal/inverse marks according to their contrast contract. The canonical web
lockup has a 22% corner radius, with Figtree 700 with -0.04em tracking for the
wordmark and Stolzl titles.

Review the hook, scenario, answer, end card, and thumbnail as a single system:
each has vertically stacked content, centered horizontally and vertically within
the safe area. The thumbnail is the hook scene. The feed and carousel remain
unchanged.

## Controlled activation

### Video thumbnail

- Confirm the brand header, `FAÇA A CONTA`, and CTA form one centered block.
- Confirm both section gaps are 40-pixel gaps in the generated layout contract.
- Confirm all essential content remains inside the square crop-safe region.
- Compare the dedicated JPEG with the video's two-second frame.
- Reject a cover that reveals the answer, clips text, substitutes the mark, or
  uses a color outside the official Troco palette.

1. Run the validation workflow. Require formatting, types, all tests, media
   probing, workflow gates, and the production-adapter contract simulations to
   pass. These simulations exercise the real Buffer GraphQL contracts for all
   three active channels without contacting the provider.
2. Download and inspect the review artifact. Check the canonical logo, all
   image slides, the complete 12-second video, amounts, answer, calls to action,
   and the four final captions. Open every attributed `troco.net` download link.
   Confirm that the manifest's deterministic soundtrack metadata matches the
   video, the music starts and ends with clean fades, the level is comfortable,
   and no clipping or silence is audible before the final frame. Confirm all
   seven background treatments over the campaign rotation, the expected
   normal/inverse mark contrast, the 22% rounded lockup, Figtree/Stolzl
   typography, and the centered safe-area stack before accepting a variant.
3. Choose one campaign dated in the future. Dispatch the production workflow
   in `controlled` mode with its exact campaign ID and confirmation
   `PUBLISH_ONE_CAMPAIGN`.
4. Confirm the Instagram, Facebook, and YouTube objects in Buffer. Check the
   exact channels, due time, ordered media, copy, UTM parameters, YouTube title,
   category, and public privacy setting. Confirm that TikTok made no provider
   request and its campaign record is terminal `skipped_disabled`. Record
   nothing manually in tracked state; the workflow persists normalized provider
   IDs.
5. Run reconciliation for the controlled campaign. It must find all existing
   Buffer objects and create zero duplicates.
6. Confirm that `state/campaigns/YYYY-MM-DD.json` contains provider IDs and no
   credentials, authorization headers, upload-session URLs, or raw payloads.
7. Only after Buffer proves the external YouTube channel ID and accepts the
   reviewed public Short contract, set `YOUTUBE_PUBLICATION_VERIFIED=true`.
   Then set `AUTO_PUBLISH=true`. Both flags are required for unattended
   publication. Monitor every run and all three active provider channels for
   the first seven days. Review Google Play Console acquisition manually; Play
   Console ingestion is deliberately not automated.

If an older controlled test uploaded a private YouTube video through Google's
API, leave that private object untouched and migrate only its future campaign
state with `npm run migrate-youtube-to-buffer -- --campaign ID --confirm
MIGRATE_PRIVATE_YOUTUBE_TO_BUFFER`. The command is one-time, future-only, and
records the `scheduled` to `retryable` transition before Buffer creates the
public scheduled Short.

## Published thumbnail backfill

Use this maintenance operation only to apply the current reviewed video cover
to an existing published campaign. It preserves the original video, caption,
audio, comments, views, permalink, and provider identity. Resolve one exact
campaign ID from `state/campaigns/YYYY-MM-DD.json`; never infer a target from a
date, title fragment, account position, or visual similarity.

First generate the cover and local review. This step performs no provider write
and creates no durable audit entry:

```sh
npm run backfill-thumbnails -- --campaign CAMPAIGN_ID --brand-root ../frontend/public
```

Open `.tmp/thumbnail-backfill/CAMPAIGN_ID/index.html`. Confirm the account,
Buffer provider ID, recognition copy, and thumbnail hash for all three published
channels. The page is intentionally headed `ALTERE SOMENTE A CAPA`: do not edit
the video, caption, music, audience, visibility, or any other post field.

For YouTube, inject `YOUTUBE_CLIENT_ID`, `YOUTUBE_CLIENT_SECRET`, and
`YOUTUBE_REFRESH_TOKEN` through the shell or secret store, never a tracked file.
Then repeat the exact campaign ID as the write confirmation:

```sh
npm run backfill-thumbnails -- --campaign CAMPAIGN_ID --brand-root ../frontend/public --channel youtube --execute --confirm CAMPAIGN_ID
```

The command finds the single public video by its immutable campaign tag, uploads
the reviewed JPEG with YouTube `thumbnails.set`, verifies thumbnail metadata,
and writes only a sanitized audit under
`state/thumbnail-backfills/CAMPAIGN_ID.json`. A completed YouTube result is
idempotent: rerunning the same command with the same thumbnail hash skips the
provider write.

Instagram and Facebook are updated in their authenticated native interfaces.
Before saving, verify the exact account, published post, existing caption, and
video. Change only the cover, verify the saved public result, and then record
the outcome independently:

```sh
npm run backfill-thumbnails -- --campaign CAMPAIGN_ID --brand-root ../frontend/public --channel instagram --record updated --confirm CAMPAIGN_ID
npm run backfill-thumbnails -- --campaign CAMPAIGN_ID --brand-root ../frontend/public --channel facebook --record updated --confirm CAMPAIGN_ID
```

Allowed native outcomes are `updated`, `unsupported`, `not_found`, and `failed`.
The audit begins at `pending`, records an attempt timestamp per channel, and
keeps sanitized failure metadata only. A successful retry clears the previous
failure. One channel never changes a sibling channel's status. If a platform no
longer supports cover editing or the exact target cannot be proven, record the
corresponding outcome and stop; never delete or republish a post as a fallback.

## Routine operation

The scheduled workflow runs every three hours and is serialized. It maintains a
rolling D through D+6 plan with one campaign due daily at 12:17 São Paulo time,
publishes public media through GitHub Pages, verifies the served bytes, records
one intent, performs one provider action, and records the result. It reconciles
before creating. It never backfills an earlier local date, even if a workflow
was unavailable that day. An overdue Buffer action is sent with `shareNow`,
never with a schedule in the past. Scheduled records are reconciled again after
their due time to record the final published state. Buffer `error` states become
persisted failures. A provider object still absent 30 minutes after its deadline
becomes retryable instead of being treated as healthy.

With `TIKTOK_ENABLED=false`, newly created campaigns only transition TikTok from
`planned` to terminal `skipped_disabled`. Later changing the flag to `true`
affects newly created campaigns only: existing skipped records stay terminal,
and the publisher never backfills them.

GitHub Pages retains only media from D−2 through D+7 in each deployment. Tracked
sanitized campaign history remains available for repetition checks and audits.
Do not use Pages as permanent media storage.

## Recovery and provider controls

### Emergency stop or disabling one provider

Set `AUTO_PUBLISH=false` first. This stops every unattended provider write
before Pages deployment. To disable one provider, set its explicit `*_ENABLED`
flag to `false` while the global gate stays false, then run planning. Existing
queued records that have no provider intent transition to `skipped_disabled`;
scheduled, published, and other provider-owned records remain untouched. Restore
the channel only after authentication and controlled verification pass.

### Retrying one failed stage

Temporary failures become `retryable`; rerun the serialized workflow after the
cause is resolved. The next-action selector retries only that channel and keeps
successful siblings unchanged. A retry still unresolved when the São Paulo day
changes is persisted as `skipped_expired`; it is never backfilled. A permanent
`failed` state is terminal: fix the configuration, inspect the incident, and use
a reviewed controlled recovery rather than editing it backward or deleting
provider objects. Reconciliation always runs before another create.

### Incidents and recovery

One open issue labeled `social-publisher-incident` represents the current
incident. Repeated failures append sanitized summaries. If multiple labeled
issues are open, stop and resolve the configuration error. A fully healthy
reconciliation appends a recovery note and closes the issue automatically.
Never paste raw Buffer responses, OAuth tokens, request headers, or workflow
environment dumps into an incident.

### Token rotation

For token rotation, set `AUTO_PUBLISH=false`, rotate one secret at a time in the
provider and GitHub, run preflight, perform one future controlled campaign, and
revoke the previous token only after verification. Rotate the Buffer API key,
`PACKAGES_READ_TOKEN`, and `SOURCE_READ_TOKEN` independently. No rotation
requires a state rewrite.

## Deactivation checklist

1. Set `AUTO_PUBLISH=false` and confirm the next scheduled run exits at its
   gate before Pages or provider writes.
2. Reconcile any persisted `scheduling` or `publishing` intent.
3. Inspect and resolve retryable/failed stages without backfilling expired days.
4. Revoke provider credentials if the automation is being retired.
5. Keep sanitized state and incident history for audit; generated media may be
   removed by normal Pages retention.
