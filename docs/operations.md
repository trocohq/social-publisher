# Social Publisher Operations

This runbook controls the one-time setup, activation, monitoring, and recovery
of Troco's automated social publication. Keep `AUTO_PUBLISH=false` until every
activation check below has passed. Code completion alone does not authorize an
unattended post.

## One-time account and repository setup

Complete these steps in order.

1. Create the public `trocohq/social-publisher` repository from this source.
   Enable GitHub Actions and GitHub Pages with **GitHub Actions** as its source.
   Set the Pages origin to `https://trocohq.github.io/social-publisher` unless a
   reviewed custom HTTPS origin is used.
2. Create a free Buffer account owned by Troco. Connect the Instagram
   `@trocohq`, Facebook `trocohq`, and TikTok `@trocofacil.app` profiles. Confirm
   that each connection can schedule the media type expected by the preflight.
3. Record the Buffer organization ID and the three channel IDs. Create a
   personal Buffer API key for this publisher only. Do not copy it into a local
   file, issue, workflow log, or campaign state.
4. In a Google Cloud project owned by Troco, enable YouTube Data API v3. Create
   an OAuth client, authorize the owning `@trocohq` YouTube account with offline
   access, and retain the refresh token in the repository secret store only.
5. Complete Google's YouTube API audit/verification required for uploads to
   become public. Until verification is confirmed, every controlled YouTube
   upload must remain **private**. A successful upload is not proof that public
   scheduling is authorized.
6. Add these repository variables:

   - `AUTO_PUBLISH=false`
   - `PAGES_ORIGIN`
   - `BUFFER_ORGANIZATION_ID`
   - `BUFFER_INSTAGRAM_CHANNEL_ID`
   - `BUFFER_FACEBOOK_CHANNEL_ID`
   - `BUFFER_TIKTOK_CHANNEL_ID`
   - `YOUTUBE_CHANNEL_ID`

7. Add these repository secrets:

   - `PACKAGES_READ_TOKEN` for read-only GitHub Packages access;
   - `SOURCE_READ_TOKEN` for read-only canonical source checkouts;
   - `BUFFER_API_KEY`;
   - `YOUTUBE_CLIENT_ID`;
   - `YOUTUBE_CLIENT_SECRET`;
   - `YOUTUBE_REFRESH_TOKEN`.

   GitHub supplies the workflow token. Do not create a broad personal token for
   state commits or incident issues.

8. Verify that the frontend checkout is exactly
   `298381c8e6c3220cde11a8109ddb727a28223d7c` and the design-token checkout is
   exactly `1fefd27a0de14a8d4115fe79c6076a3b17d3cf6d`. Brand hashes and the packaged
   token source must match those reviewed commits.

## Controlled activation

1. Run the validation workflow. Require formatting, types, all tests, media
   probing, workflow gates, and the local provider simulations to pass.
2. Download and inspect the review artifact. Check the canonical logo, all
   image slides, the complete 12-second video, amounts, answer, calls to action,
   and the four final captions. Open every attributed Google Play link.
3. Choose one campaign dated in the future. Dispatch the production workflow
   in `controlled` mode with its exact campaign ID and confirmation
   `PUBLISH_ONE_CAMPAIGN`.
4. Confirm the Instagram, Facebook, and TikTok objects in Buffer. Check their
   channel, due time, ordered media, copy, and UTM parameters. Record nothing
   manually in tracked state; the workflow persists normalized provider IDs.
5. Confirm that the corresponding YouTube Short exists on the owning channel,
   has the campaign fingerprint tag, and remains private during pre-audit
   verification. Check title, description, media, and schedule.
6. Run reconciliation for the controlled campaign. It must find the existing
   Buffer and YouTube objects and create zero duplicates.
7. Confirm that `state/campaigns/YYYY-MM-DD.json` contains provider IDs and no
   credentials, authorization headers, upload-session URLs, or raw payloads.
8. Only after all checks pass, set `AUTO_PUBLISH=true`. Monitor every run and
   all four provider queues for the first seven days. Review Google Play Console
   acquisition manually; Play Console ingestion is deliberately not automated.

## Routine operation

The scheduled workflow runs every three hours and is serialized. It creates a
rolling D through D+6 plan, publishes public media through GitHub Pages, verifies
the served bytes, records one intent, performs one provider action, and records
the result. It reconciles before creating. It never backfills an earlier local
date, even if a workflow was unavailable that day.

GitHub Pages retains only media from D−2 through D+7 in each deployment. Tracked
sanitized campaign history remains available for repetition checks and audits.
Do not use Pages as permanent media storage.

## Recovery and provider controls

### Emergency stop or disabling one provider

Set `AUTO_PUBLISH=false` first. This stops every unattended provider write
before Pages deployment. To disable one provider, pause/disconnect that channel
in Buffer or revoke the relevant YouTube credential while the global gate stays
false. Run preflight to confirm that the disabled connection is detected. Keep
the publisher globally paused until the channel is either restored and tested
in controlled mode or its pending channel records are reviewed and explicitly
marked `skipped_disabled` through a reviewed state change.

### Retrying one failed stage

Temporary failures become `retryable`; rerun the serialized workflow after the
cause is resolved. The next-action selector retries only that channel and keeps
successful siblings unchanged. A permanent `failed` state is terminal: fix the
configuration, inspect the incident, and use a reviewed controlled recovery
rather than editing it backward or deleting provider objects. Reconciliation
always runs before another create.

### Incidents and recovery

One open issue labeled `social-publisher-incident` represents the current
incident. Repeated failures append sanitized summaries. If multiple labeled
issues are open, stop and resolve the configuration error. A fully healthy
reconciliation appends a recovery note and closes the issue automatically.
Never paste raw Buffer responses, OAuth tokens, resumable upload URLs, request
headers, or workflow environment dumps into an incident.

### Token rotation

For token rotation, set `AUTO_PUBLISH=false`, rotate one secret at a time in the
provider and GitHub, run preflight, perform one future controlled campaign, and
revoke the previous token only after verification. Rotate the Buffer API key,
YouTube refresh/client credentials, `PACKAGES_READ_TOKEN`, and
`SOURCE_READ_TOKEN` independently. No rotation requires a state rewrite.

## Deactivation checklist

1. Set `AUTO_PUBLISH=false` and confirm the next scheduled run exits at its
   gate before Pages or provider writes.
2. Reconcile any persisted `scheduling` or `publishing` intent.
3. Inspect and resolve retryable/failed stages without backfilling expired days.
4. Revoke provider credentials if the automation is being retired.
5. Keep sanitized state and incident history for audit; generated media may be
   removed by normal Pages retention.
