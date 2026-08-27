# README Operations Guide Design

> Define a concise, factual operations overview for the social publisher README.

## Objective

Expand the root `README.md` so a maintainer can understand the production
schedule, publication volume, content formats, automated workflow, current
activation state, and remaining work without reading implementation code.

The README remains in English. Detailed setup, recovery, credentials, and
incident procedures stay in `docs/operations.md` and are linked instead of
duplicated.

## Information architecture

Add the following production-facing sections near the existing automated
delivery overview:

1. **Production status** — a dated activation snapshot that identifies the
   three connected Buffer channels, the disabled TikTok channel, the enabled
   safety gates, and the initially seeded queue.
2. **Schedule and volume** — distinguish the workflow cadence from the content
   cadence. The workflow runs every three hours at minute 17 and each campaign
   is due at 12:17 in `America/Sao_Paulo`. The steady-state volume is one
   campaign per day, one post per active channel, seven posts per channel per
   week, and 21 provider posts per week across the three active channels.
3. **Weekly editorial rotation** — map each weekday to the implemented campaign
   family and media recipe.
4. **What the workflow does** — summarize planning, deterministic rendering,
   validation, GitHub Pages deployment, Buffer preflight, duplicate prevention,
   serialized provider writes, reconciliation, health checks, state commits,
   and incident handling.
5. **Channel output** — explain that Instagram and Facebook receive feed images
   or carousels, while YouTube receives a public 1080×1920 Short. Every campaign
   also renders the vertical video and channel-specific Brazilian Portuguese
   copy with attributed Google Play URLs.
6. **Capacity and retention** — record the free Buffer limits relevant to the
   design: three connected channels and ten queued posts per channel. Explain
   that the D through D+6 window stays within this capacity and that GitHub
   Pages retains only D−2 through D+7 media.
7. **Remaining work** — list the unresolved TikTok authentication and free-plan
   channel constraint, the initial seven-day production monitoring period,
   manual Google Play acquisition review, and the absence of automatic
   analytics ingestion.

## Verified production facts

- GitHub Actions cron: `17 */3 * * *`.
- Workflow checks occur every three hours; GitHub may delay scheduled starts.
- Campaign due time: 12:17, São Paulo time.
- Rolling plan: local day D through D+6; past dates are never backfilled.
- Active channels: Instagram `@trocohq`, Facebook `trocohq`, and YouTube
  `@trocohq` through Buffer.
- Disabled channel: TikTok `@trocofacil.app`.
- Current activation snapshot on 2026-08-27: six scheduled posts per active
  channel for 2026-08-28 through 2026-09-02, 18 provider posts in total.
- Safety gates: `AUTO_PUBLISH=true` and
  `YOUTUBE_PUBLICATION_VERIFIED=true` after controlled verification.
- Buffer Free capacity: three connected channels and ten queued posts per
  channel; all three channel slots are currently occupied.

## Editorial rotation

| Day | Campaign family | Primary recipe |
| --- | --- | --- |
| Monday | Change challenge | Video-led challenge |
| Tuesday | Cashier shortcut | Four-slide carousel |
| Wednesday | Troco explains | Single feed image |
| Thursday | Quick calculation | Video-led calculation |
| Friday | Safe checkout | Four-slide carousel |
| Saturday | Checkout situation | Video-led scenario |
| Sunday | Save this rule | Single feed image |

The renderer selects among the official green, blue, yellow, and purple
palettes. Each palette maps deterministically to one original generated music
arrangement: warm, airy, bright, or pulse.

## Accuracy and maintenance rules

- Label queue counts as a dated activation snapshot so they do not appear to
  be permanent live metrics.
- Describe cron as a health/refill cadence, not as eight new posts per day.
- Keep the stable volume calculation separate from the current queue count.
- Do not expose provider IDs, tokens, secrets, authorization details, or raw
  responses in the README.
- Link to the operations runbook for activation, recovery, and credential
  rotation.
- Keep TikTok explicitly disabled until authentication, capacity, controlled
  publication, and reconciliation are resolved.

## Validation

After editing the README:

1. Run formatting, type checking, and all publisher tests with Node.js 24.
2. Run the existing documentation contract tests through `npm run check`.
3. Scan the README for contradictory schedule, channel, volume, and activation
   statements.
4. Confirm the working tree contains only the intended documentation changes
   before creating a micro-commit on `main` without pushing.
