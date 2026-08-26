# Troco Social Publisher Design

**Date:** 2026-08-26

**Status:** Approved design; implementation plans ready for execution

**Primary outcome:** Increase qualified Google Play downloads through consistent daily social publishing

**Constraint:** No recurring paid services

## 1. Objective

Build a production social publisher for Troco that plans, renders, schedules, publishes, and reconciles one campaign every calendar day without routine human work.

Each campaign must produce:

- a feed image or carousel suitable for Instagram, Facebook, and TikTok;
- a vertical short video suitable for Instagram Reels, Facebook Reels, TikTok, and YouTube Shorts;
- channel-specific copy, calls to action, and metadata;
- durable state that prevents duplicate publication and supports targeted retries.

The publisher is not event-driven. A recurring clock is its only trigger. It maintains a rolling seven-day publication window and replenishes the window as time advances.

## 2. Product boundaries

The work spans two repositories:

1. `social-publisher`, a new standalone public repository, owns editorial recipes, planning, rendering, temporary public media, provider clients, state, scheduled workflows, dry runs, and validation.
2. `frontend` owns the public site and receives only the official social links in its footer.

The publisher must not become part of the statically exported Next.js application. The frontend must not own provider credentials, publication state, or scheduled jobs.

The public publisher repository contains no credentials. It uses GitHub Actions secrets for private package or repository access, Buffer, and YouTube OAuth.

## 3. Official channels

| Channel   | Official profile                         | Delivery path    | Daily media              |
| --------- | ---------------------------------------- | ---------------- | ------------------------ |
| Instagram | <https://www.instagram.com/trocohq>      | Buffer API       | Image, carousel, or Reel |
| Facebook  | <https://www.facebook.com/trocohq>       | Buffer API       | Image, carousel, or Reel |
| TikTok    | <https://www.tiktok.com/@trocofacil.app> | Buffer API       | Photo post or video      |
| YouTube   | <https://www.youtube.com/@trocohq>       | YouTube Data API | Short video only         |

Profile URLs are configuration values, not duplicated literals. A future TikTok handle change requires one configuration edit plus contract-test updates.

## 4. Zero-cost delivery strategy

The free Buffer plan connects Instagram, Facebook, and TikTok. The publisher uses one personal Buffer API key and keeps no more than seven scheduled posts per channel, below the current free-plan limit of ten.

YouTube is connected directly through OAuth and the YouTube Data API because it would be a fourth Buffer channel. Public automated uploads cannot be activated until the Google API project and channel satisfy YouTube's verification requirements.

Generated media is deployed through GitHub Pages. Pages deployments contain only a rolling media window; generated binaries are never committed to Git history.

All application code, rendering, storage, scheduling, and monitoring use free and open-source tooling or included GitHub repository features.

## 5. System architecture

```text
GitHub Actions clock
        |
        v
Rolling-window planner -----> durable campaign state
        |
        v
Editorial composer -----> typed CampaignPlan
        |
        +------> feed renderer ------> JPEG carousel assets
        |
        +------> short renderer -----> MP4/H.264 vertical video
        |
        v
GitHub Pages deployment + public hash verification
        |
        +------> Buffer API ------> Instagram / Facebook / TikTok
        |
        +------> YouTube API -----> YouTube Shorts
        |
        v
Provider reconciliation, metrics references, and durable results
```

### 5.1 Runtime

- Node.js 20 or newer, ECMAScript modules, and functional modules.
- `sharp` renders raster images from deterministic SVG documents.
- FFmpeg assembles scene images into MP4/H.264 videos with AAC audio.
- Node's test runner validates deterministic contracts.
- GitHub Actions runs CI, scheduled planning, Pages deployment, publication, and incident reporting.

The design deliberately avoids runtime LLMs and image-generation services. A free CPU runner cannot provide reliable generative media, and provider output must remain deterministic and reviewable.

### 5.2 Module boundaries

- `config`: environment parsing, channel configuration, schedule, limits, and feature flags.
- `editorial`: recipes, facts, weekly rotation, deterministic variants, claim validation, and anti-repetition.
- `planning`: rolling-window decisions and immutable `CampaignPlan` creation.
- `render/image`: 4:5 feed cards and carousel slides.
- `render/video`: 9:16 scenes, transitions, timing, audio, and encoding.
- `media`: output manifests, GitHub Pages payload, and public verification.
- `networks/buffer`: Buffer scheduling, lookup, reconciliation, and normalized results.
- `networks/youtube`: OAuth refresh, upload, scheduling, lookup, and normalized results.
- `state`: schema validation, loading, transitions, sanitization, and atomic writes.
- `publishing`: orchestration across independent per-channel stages.
- `validation`: fixtures, dry runs, visual/technical checks, and workflow contracts.
- `cli`: `plan`, `dry-run`, `publish`, `reconcile`, and controlled activation commands.

Every module exposes a narrow interface and must be independently testable with injected clocks, state, filesystem roots, and provider functions.

## 6. Editorial system

### 6.1 Weekly rotation

| Day       | Campaign family         | Primary format for Instagram, Facebook, and TikTok | YouTube format           |
| --------- | ----------------------- | -------------------------------------------------- | ------------------------ |
| Monday    | Change challenge        | Short video                                        | Short video              |
| Tuesday   | Cashier shortcut        | Carousel                                           | Animated carousel Short  |
| Wednesday | Troco explains          | Feed image                                         | Animated explainer Short |
| Thursday  | Quick calculation       | Short video                                        | Short video              |
| Friday    | Safe checkout           | Carousel                                           | Animated checklist Short |
| Saturday  | Real checkout situation | Short video                                        | Short video              |
| Sunday    | Save this rule          | Feed image                                         | Animated summary Short   |

The schedule is stored as configuration and can be changed without rewriting selection logic.

### 6.2 Content sources

The composer uses only structured, repository-owned material:

- BRL purchase, payment, change, banknote, and coin combinations derived through shared Troco money contracts;
- validated product capabilities referenced to current source code or product documentation;
- cashier and small-business tips from a curated fact catalog;
- payment-safety claims extracted from the existing Troco blog and linked to their authoritative sources;
- fixed Brazilian calendar moments that are relevant to retail and do not require live data;
- reusable hooks, explanations, answers, and calls to action written in Troco's voice.

There is no runtime scraping, trend chasing, fabricated testimonial, invented download count, unsupported platform claim, or factual completion by a language model.

Each factual entry carries an identifier, source reference, review date, allowed campaign families, and optional expiry date. Expired or unsourced entries fail planning.

### 6.3 Deterministic variety

The local publication date, recipe version, and campaign family produce a deterministic seed. The planner combines compatible hooks, scenarios, numeric examples, layouts, palettes, and CTAs from that seed.

Before accepting a plan, it checks durable history and rejects:

- the same recipe and scenario combination within 90 days;
- the same normalized headline or caption fingerprint within 365 days;
- the same purchase/payment pair within 90 days;
- consecutive use of the same visual palette and CTA.

If a collision occurs, the planner advances to the next deterministic candidate. Exhausting valid candidates fails safely and opens an incident rather than publishing a duplicate or empty campaign.

### 6.4 Copy and conversion

All social copy is Brazilian Portuguese. Every campaign gives useful information before asking for an action.

Calls to action rotate between:

- downloading Troco from Google Play, the primary conversion;
- trying the web calculator;
- saving or sharing a useful rule.

Channel adapters apply provider-specific length, hashtag, and title constraints. A channel may shorten optional supporting copy but may not change the factual claim, numeric answer, or campaign identity.

Download destinations use channel and campaign attribution parameters where supported. The canonical Google Play URL remains the source for every generated link.

## 7. Visual and motion system

### 7.1 Approved direction

The approved direction is **Product Editorial**:

- broad Troco color fields;
- large Stolzl display type;
- Figtree for supporting copy;
- the numeric answer as the primary visual subject;
- rounded paper stages and restrained depth;
- receipt motifs for checkout-specific campaigns;
- faster kinetic timing for TikTok and Reel variants without changing the brand grammar.

The renderer uses the current design tokens:

- Ink `#213130`
- Paper `#FEFDFB`
- Troco green `#B0EC9C`
- Soft green `#D8F1D0`
- Purple `#E6DBFF`
- Yellow `#FFD88A`
- Blue `#ADDAFF`
- Coral `#FFB2A8`

### 7.2 Brand integrity

The publisher never redraws or approximates the Troco mark. It consumes:

- `frontend/public/brand/troco-mark.svg`;
- `frontend/public/brand/troco-mark-inverse.svg`;
- `frontend/public/fonts/stolzl-regular.woff2`;
- `frontend/public/fonts/figtree-variable.ttf`;
- the canonical design-token package or its exact source checkout.

A brand manifest stores expected hashes. The workflow checks out the canonical frontend and token sources at explicit commits, validates the files, and stops if an expected asset is absent or changed. Updating the brand requires a deliberate manifest update and a reviewed visual fixture.

There is no placeholder-logo fallback.

### 7.3 Feed output

- Primary canvas: 1080×1350, 4:5.
- Color profile: sRGB.
- Delivery format: JPEG with a quality and byte-size budget validated against every provider.
- Carousel: two to five slides; all slides share one aspect ratio.
- Every slide keeps text within a shared safe area.
- The first slide is a cover; the last slide resolves the lesson and presents a restrained CTA.
- Critical meaning never depends on color alone.

### 7.4 Short-video output

- Canvas: 1080×1920, 9:16.
- Frame rate: 30 fps.
- Duration: 8–20 seconds.
- Codec: H.264 video and AAC audio in MP4.
- Structure: hook, scenario, reveal or lesson, and Troco end card.
- Motion: slide, count, scale, and crossfade transitions derived from static scenes.
- Text remains readable with audio muted.
- Audio uses a quiet, procedurally generated original tone bed and transition cues. It does not depend on platform music libraries or copyrighted tracks.
- No spoken narration is required for the first production design; the content is complete through motion and on-screen copy.

Image-led campaign days use the feed assets on Instagram, Facebook, and TikTok while the same scenes become an animated Short for YouTube. Video-led days send the vertical video to all four networks.

## 8. Planning and schedule

The planner maintains campaigns for the local date through six days ahead in `America/Sao_Paulo`.

- Default publication time: 12:17 local time for every channel.
- The time is configuration, not a code constant.
- The scheduled workflow runs every three hours and reconciles the rolling window.
- Buffer receives no more than seven future posts per channel.
- YouTube Shorts may be uploaded in advance with their target publication time.
- If today's post is missing after its target time, the workflow may publish it immediately until the end of that local day.
- The system never backfills an earlier date, preventing a burst of stale posts.
- A campaign is immutable after any channel has been scheduled. Later source changes apply only to unscheduled dates.

GitHub schedule delay is therefore harmless: the providers normally hold the publication time, while the recurring workflow fills gaps and reconciles results.

## 9. Public media lifecycle

The Pages payload contains media for two days in the past through seven days in the future. This covers provider fetches and retry windows without accumulating an archive.

The workflow:

1. renders all missing campaign assets locally;
2. validates dimensions, formats, duration, and hashes;
3. uploads one Pages artifact containing the rolling window;
4. deploys the artifact;
5. fetches every public URL over HTTPS;
6. compares the received byte hash to the local manifest;
7. calls Buffer only after every required media URL is verified.

YouTube uploads the local MP4 directly and does not depend on the Pages URL.

## 10. Durable state

Tracked JSON state contains only sanitized operational data.

### 10.1 Campaign state

Each campaign records:

- schema version;
- campaign ID derived from local date, family, recipe version, and seed;
- local publication date and target time;
- immutable editorial inputs and normalized copy fingerprints;
- source and brand commit references;
- image, carousel, video, and manifest hashes;
- one media-deployment stage;
- independent Instagram, Facebook, TikTok, and YouTube stages.

### 10.2 Stage states

Valid states are:

- `planned`
- `rendered`
- `deploying`
- `media_verified`
- `scheduling`
- `scheduled`
- `publishing`
- `published`
- `retryable`
- `failed`
- `skipped_disabled`
- `skipped_expired`

Every transition records the time, attempt count, sanitized error category, and normalized provider result when available.

### 10.3 Publications

Completed publications retain provider IDs, permanent URLs when available, publication times, final hashes, and campaign attribution. Generated media binaries are not retained in Git.

## 11. Idempotency and reconciliation

State intent is committed before external provider calls. Results are committed after publication work. A repository-wide workflow concurrency group prevents overlapping runs.

If a run stops after a provider accepts work but before its result commit, the next run reconciles before retrying:

- Buffer reconciliation matches channel, due time, normalized copy, and campaign media URL.
- YouTube adds the campaign fingerprint to owner-visible video metadata and queries the authenticated upload list before another upload.
- A confirmed provider object is recorded instead of recreated.
- Only the failed or unknown channel stage is retried.

Permanent provider failure does not erase successful sibling stages. Credentials, tokens, raw request headers, and unfiltered provider payloads are never written to state or logs.

## 12. Error handling and incidents

- Schema, editorial, rendering, brand, or public-media validation failures stop the entire campaign before provider scheduling.
- One provider's temporary failure becomes `retryable` without reopening successful channels.
- Authentication or configuration errors fail closed and stop new deliveries for that provider.
- A single GitHub Issue represents the active publisher incident. Repeated runs update that issue instead of opening duplicates; recovery closes it automatically.
- Workflow summaries show sanitized campaign, stage, and result information.
- Scheduled automation starts disabled. A controlled publication is mandatory before activation.

## 13. Security

- GitHub Actions secrets hold the Buffer API key, YouTube OAuth client and refresh token, and fine-grained read credentials for private Troco source repositories or packages.
- Workflow permissions are minimal and declared per job.
- Third-party actions are pinned to full commit SHAs.
- Node dependencies are locked and audited.
- Provider origins and Pages media origins are allowlisted HTTPS URLs.
- Public content is escaped before SVG or HTML interpolation.
- Editorial inputs are schema-validated and cannot inject markup, shell arguments, or filenames.
- FFmpeg receives argument arrays, not concatenated shell input.
- State validation rejects sensitive key names and suspicious provider payloads.
- Pull requests never receive production secrets and can never publish.

## 14. Frontend footer

The existing dark footer gains an accessible social-icon row in its lower-right utility area, before language and appearance controls.

Requirements:

- Instagram, TikTok, YouTube, and Facebook appear in that order.
- Each link has a 44×44 px minimum target, visible keyboard focus, platform name for assistive technology, and a useful hover state.
- Links open in a new tab with `rel="noopener noreferrer"`.
- Platform SVGs come from a pinned, trusted icon source; placeholders or approximations are not allowed.
- URLs come from one typed constants module and match the official profiles in section 3.
- The row remains readable in every locale and at mobile and desktop widths.
- Site contract tests assert the exact URLs and accessible names.

No other footer structure or navigation changes are in scope.

## 15. Validation and tests

### 15.1 Deterministic unit contracts

- timezone and local-date behavior;
- weekly family selection;
- seeded candidate selection;
- 90-day and 365-day repetition guards;
- valid BRL calculations and denomination breakdowns;
- claim source and expiry rules;
- provider-specific copy limits;
- state schemas and legal transitions;
- error sanitization and secret-key rejection;
- rolling-window and missed-day decisions.

### 15.2 Render contracts

- exact image dimensions and sRGB output;
- text bounding boxes remain within safe areas for worst-case fixtures;
- canonical brand hashes and fonts are present;
- carousel consistency;
- MP4 container, H.264 codec, AAC audio, 1080×1920 dimensions, 30 fps, duration, and byte-size limits through `ffprobe`;
- deterministic output hashes under the pinned runtime;
- representative visual fixtures for every campaign family.

### 15.3 Integration contracts

- Buffer GraphQL requests and normalized error handling through fake HTTP servers;
- Buffer reconciliation after an interrupted result commit;
- YouTube token refresh, resumable upload, scheduling, and duplicate lookup through fake HTTP servers;
- Pages manifest verification and hash mismatch rejection;
- partial provider failure and isolated retry;
- workflow permissions, concurrency, secret scoping, and production gates.

### 15.4 Dry run

`dry-run` produces a local review directory containing:

- the complete `CampaignPlan`;
- final captions by channel;
- feed image and every carousel slide;
- final MP4 Short;
- an HTML review page;
- technical media metadata and hashes;
- no state mutation and no external write.

### 15.5 Frontend validation

The footer change must pass the frontend's required `npm test`, `npm run lint`, and `npm run build`, plus manual verification in light/dark appearances, all three locales, keyboard navigation, mobile, and desktop.

## 16. Production activation

Activation is a one-time operator sequence, not a recurring publishing task:

1. Create the public `social-publisher` GitHub repository and enable Pages.
2. Connect the professional Instagram account, Facebook Page, and TikTok account to a free Buffer account.
3. Store the Buffer API key and source-repository read token as GitHub Actions secrets.
4. Create and authorize a Google API project for the owning YouTube channel, store its OAuth credentials, and complete the verification needed for public automated uploads.
5. Run CI and a real dry run for a chosen future campaign.
6. Run a controlled Buffer scheduling operation for that campaign.
7. Upload the YouTube variant privately, verify reconciliation, and only then schedule it publicly.
8. Verify the four provider IDs, media, copy, links, and permanent URLs.
9. Set the exact automatic-publishing flag to `true`.

Activation begins with future dates and never backfills the pre-activation calendar.

## 17. Success criteria

The design is complete when:

- one campaign is published every local day to all four configured networks;
- Instagram, Facebook, and TikTok use the intended image/carousel or video format;
- YouTube receives a valid Short every day;
- no recurring paid service is required;
- exact daily content does not repeat inside the defined windows;
- provider retries do not duplicate successful posts;
- brand assets always match the canonical frontend sources;
- every published claim is traceable to a validated source;
- a dry run makes the complete future output reviewable;
- the frontend footer exposes the four exact official profiles accessibly;
- Google Play remains the primary conversion destination.

Download growth is evaluated in Google Play Console. Provider IDs, post URLs, campaign IDs, and attribution parameters give each daily campaign a traceable identity, but automatic Play Console ingestion is outside this implementation.

## 18. Non-goals

- Paid LLM, image, video, voice, stock-media, or scheduling services.
- Runtime web scraping or trend replication.
- Automatic comments, direct messages, or community moderation.
- Long-form YouTube video.
- Platform-native music, stickers, filters, polls, collaboration posts, or product tags.
- Photorealistic generated people or fabricated customer stories.
- Multi-language social accounts in the first production system.
- Backfilling dates missed before activation.
- Automatic modification of old published posts after a source or brand change.
- Automatic Google Play Console analytics ingestion.

## 19. External prerequisites and known constraints

- The Buffer free plan must continue to provide three connected channels, API access, and sufficient scheduled-post capacity. The preflight checks observed account limits and fails closed if they no longer satisfy the rolling window.
- TikTok and other networks can change accepted formats or third-party rules. Provider capability checks run before scheduling.
- YouTube public API uploads require the user's OAuth authorization and may require Google verification or audit. Code can be completed before approval, but unattended public YouTube delivery cannot operate until Google grants it.
- GitHub Actions schedules can be delayed. The seven-day provider schedule and recurring reconciliation remove exact cron execution from the critical path.
- GitHub Pages media is public by design and contains only publishable campaign assets.

## 20. Reference documentation

- Buffer API: <https://buffer.com/api>
- Buffer pricing and free-plan limits: <https://buffer.com/pricing>
- Buffer posts and scheduling: <https://developers.buffer.com/guides/posts-and-scheduling.html>
- Buffer TikTok support: <https://support.buffer.com/en-us/articles/using-tiktok-with-buffer-oGEroY9Of2>
- Buffer YouTube Shorts support: <https://support.buffer.com/en-us/articles/using-youtube-shorts-with-buffer-Jl8iR6jIck>
- TikTok Content Sharing Guidelines: <https://developers.tiktok.com/docs/en/content-sharing-guidelines>
- YouTube Data API: <https://developers.google.com/youtube/v3/docs>
- YouTube video uploads: <https://developers.google.com/youtube/v3/docs/videos/insert>

## 21. Approved decisions

- Complete implementation rather than a reduced MVP.
- Fully automated daily publishing after one-time provider activation.
- Images, carousels, and short videos from the first production release.
- Hybrid structured editorial engine with no runtime generative AI.
- Zero recurring cost.
- Downloads as the primary objective.
- Buffer for Instagram, Facebook, and TikTok.
- Direct YouTube API integration.
- Product Editorial visual direction.
- Exact canonical Troco mark and fonts from the frontend.
- Separate `social-publisher` repository.
- Four social icons added to the frontend footer.
