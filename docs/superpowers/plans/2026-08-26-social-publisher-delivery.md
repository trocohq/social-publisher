# Troco Social Publisher Delivery Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add durable state, rolling GitHub Pages media, idempotent Buffer and YouTube delivery, reconciliation, incident reporting, and controlled daily automation to the completed publisher core.

**Architecture:** Tracked JSON records immutable campaign plans and independent media/provider stages. The workflow commits intent before each provider write, reconciles ambiguous outcomes before retrying, and commits normalized results afterward. Buffer schedules Instagram, Facebook, and TikTok from verified Pages URLs; YouTube receives the local MP4 through OAuth resumable upload.

**Tech Stack:** Node.js 20.19+, TypeScript 6, Zod 4, native Fetch API, Buffer GraphQL API, YouTube Data API v3 and OAuth 2.0, GitHub Pages, GitHub Actions, Node test runner

---

## Prerequisite

Execute `2026-08-26-social-publisher-core.md` first. This plan assumes `CampaignPlan`, renderers, media probes, brand validation, and the read-only dry-run are implemented and passing.

## Repository and file map

All paths below are relative to the `social-publisher` repository.

- `src/config/environment.ts`: the single validated source of provider, origin, channel, and feature-flag configuration.
- `src/state/schema.ts`: campaign, media, provider-stage, attempt, and normalized-result schemas.
- `src/state/transitions.ts`: explicit legal state-machine transitions.
- `src/state/storage.ts`: sanitized atomic JSON loading/writing and campaign listing.
- `src/state/sanitize.ts`: secret-key, URL, header, and provider-error redaction.
- `src/media/manifest.ts`: local media records and public URL derivation.
- `src/media/pages.ts`: D-2 through D+7 Pages payload creation.
- `src/media/verify-public.ts`: HTTPS, content type, byte length, and hash verification.
- `src/networks/types.ts`: normalized provider interfaces and outcomes.
- `src/networks/buffer/graphql.ts`: typed GraphQL transport and error classification.
- `src/networks/buffer/preflight.ts`: organization/channel/service/queue capability checks.
- `src/networks/buffer/posts.ts`: create and list scheduled/sent posts.
- `src/networks/buffer/reconcile.ts`: ambiguous-write matching before retry.
- `src/networks/youtube/oauth.ts`: in-memory access-token refresh.
- `src/networks/youtube/upload.ts`: resumable video insertion and scheduling.
- `src/networks/youtube/reconcile.ts`: uploads-playlist fingerprint lookup.
- `src/publishing/next-action.ts`: one deterministic pending campaign/channel action.
- `src/publishing/intent.ts`: transition and persist intent without provider access.
- `src/publishing/execute.ts`: reconcile, write once, and normalize the result.
- `src/incidents/github.ts`: one active incident issue, updated until recovery.
- `src/cli/plan.ts`, `publish.ts`, `reconcile.ts`, `incident.ts`: narrow workflow commands.
- `scripts/commit-state.sh`: conflict-aware state-only commit and push.
- `state/index.json`: sanitized schema version and campaign references.
- `state/campaigns/YYYY-MM-DD.json`: one immutable plan and mutable stage envelope per local date.
- `.github/workflows/validate.yml`: secret-free pull-request validation and review artifact.
- `.github/workflows/publish.yml`: disabled-by-default rolling publication workflow.
- `docs/operations.md`: provider setup, controlled activation, recovery, and rotation.
- `tests/**/*.test.ts`: state, fake-server, workflow, and orchestration contracts.

## Task 1: Parse production configuration and fail closed

**Files:**
- Create: `src/config/environment.ts`
- Create: `tests/environment.test.ts`
- Modify: `.env.example`

- [ ] **Step 1: Write failing configuration tests**

```ts
// tests/environment.test.ts
import assert from "node:assert/strict";
import test from "node:test";
import { parseEnvironment } from "../src/config/environment.js";

const valid = {
  AUTO_PUBLISH: "false", PUBLICATION_TIME_ZONE: "America/Sao_Paulo", PUBLISH_TIME: "12:17",
  PAGES_ORIGIN: "https://trocohq.github.io/social-publisher", BUFFER_ORGANIZATION_ID: "org_1",
  BUFFER_INSTAGRAM_CHANNEL_ID: "ig_1", BUFFER_FACEBOOK_CHANNEL_ID: "fb_1", BUFFER_TIKTOK_CHANNEL_ID: "tt_1",
  YOUTUBE_CHANNEL_ID: "UC123", PLAY_STORE_URL: "https://play.google.com/store/apps/details?id=trocofacil.app",
  BRAND_SOURCE_SHA: "298381c8e6c3220cde11a8109ddb727a28223d7c",
  DESIGN_TOKENS_SOURCE_SHA: "1fefd27a0de14a8d4115fe79c6076a3b17d3cf6d",
};

test("automatic publishing defaults false and accepts only allowlisted HTTPS origins", () => {
  assert.equal(parseEnvironment(valid).autoPublish, false);
  assert.throws(() => parseEnvironment({ ...valid, AUTO_PUBLISH: "yes" }), /AUTO_PUBLISH/);
  assert.throws(() => parseEnvironment({ ...valid, PAGES_ORIGIN: "http://example.com" }), /PAGES_ORIGIN/);
});

test("production secrets are required only for provider execution", () => {
  assert.doesNotThrow(() => parseEnvironment(valid, "planning"));
  assert.throws(() => parseEnvironment(valid, "provider"), /BUFFER_API_KEY/);
});
```

- [ ] **Step 2: Run the focused tests and verify failure**

Run: `node --import tsx --test --test-name-pattern="automatic publishing|production secrets" tests/*.test.ts`

Expected: FAIL because `environment.ts` does not exist.

- [ ] **Step 3: Implement one strict environment schema**

Use Zod to parse the fields in the test plus `BUFFER_API_KEY`, `YOUTUBE_CLIENT_ID`, `YOUTUBE_CLIENT_SECRET`, `YOUTUBE_REFRESH_TOKEN`, `GITHUB_REPOSITORY`, and `GITHUB_TOKEN`. Return camel-case values and expose `parseEnvironment(source, purpose)` where `purpose` is `planning`, `provider`, or `incident`; provider secrets are required only for `provider`, while repository/token fields are required only for `incident`. Parse booleans with `z.enum(["true", "false"]).transform(value => value === "true")`; reject unknown `PUBLICATION_TIME_ZONE`; validate `PUBLISH_TIME` against `^(?:[01]\d|2[0-3]):[0-5]\d$`; require both source SHAs to be 40 lowercase hex characters; and require exactly the HTTPS origins `https://api.buffer.com`, `https://oauth2.googleapis.com`, `https://www.googleapis.com`, and the configured GitHub Pages origin. Do not retain the source object or include secret values in Zod error messages.

Append the non-secret IDs and feature flag to `.env.example`, and list secret names with empty values. Never add a real value.

- [ ] **Step 4: Run configuration tests and typecheck**

Run: `node --import tsx --test --test-name-pattern="automatic publishing|production secrets" tests/*.test.ts && npm run typecheck`

Expected: both tests PASS and TypeScript exits `0`.

- [ ] **Step 5: Commit production configuration**

```bash
git add src/config/environment.ts tests/environment.test.ts .env.example
git commit -m "feat: validate publisher production configuration"
```

## Task 2: Add sanitized durable campaign state and legal transitions

**Files:**
- Create: `src/state/schema.ts`
- Create: `src/state/transitions.ts`
- Create: `src/state/sanitize.ts`
- Create: `src/state/storage.ts`
- Create: `state/index.json`
- Create: `tests/state.test.ts`

- [ ] **Step 1: Write failing state and sanitization tests**

```ts
// tests/state.test.ts
import assert from "node:assert/strict";
import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { transitionProvider } from "../src/state/transitions.js";
import { sanitizeError } from "../src/state/sanitize.js";
import { writeCampaignState } from "../src/state/storage.js";
import { campaignStateFixture } from "./support/state-fixture.js";

test("provider transitions reject illegal skips and retain sibling success", () => {
  const state = campaignStateFixture();
  assert.throws(() => transitionProvider(state, "instagram", "published", new Date("2026-08-26T10:00:00Z")), /Illegal transition/);
  const scheduled = transitionProvider(state, "instagram", "scheduling", new Date("2026-08-26T10:00:00Z"));
  assert.equal(scheduled.channels.youtube.stage, state.channels.youtube.stage);
});

test("tracked errors reject secret-bearing keys and values", () => {
  assert.deepEqual(sanitizeError({ message: "Bearer abc123", response: { authorization: "secret" } }), {
    category: "redacted_provider_error", message: "Provider error contained sensitive data",
  });
});

test("campaign state is atomically written as validated JSON", async () => {
  const root = await mkdtemp(join(tmpdir(), "troco-state-"));
  await writeCampaignState(root, campaignStateFixture());
  const saved = JSON.parse(await readFile(join(root, "campaigns/2026-08-26.json"), "utf8"));
  assert.equal(saved.schemaVersion, 1);
});
```

- [ ] **Step 2: Run state tests and verify failure**

Run: `node --import tsx --test --test-name-pattern="provider transitions|tracked errors|atomically written" tests/*.test.ts`

Expected: FAIL because the state modules are missing.

- [ ] **Step 3: Implement schemas, transition graph, and atomic storage**

Define the shared stage enum exactly as:

```ts
export const stageSchema = z.enum([
  "planned", "rendered", "deploying", "media_verified", "scheduling", "scheduled",
  "publishing", "published", "retryable", "failed", "skipped_disabled", "skipped_expired",
]);
```

Each channel record contains `stage`, `attempts`, `transitions`, optional normalized `providerId`, `permalink`, `scheduledAt`, `publishedAt`, and sanitized `lastError`. The campaign envelope contains schema version, the complete immutable `CampaignPlan`, source/brand commits, render hashes, one media stage, and records for `instagram`, `facebook`, `tiktok`, and `youtube`.

Implement this legal graph: `planned→rendered→deploying→media_verified`; provider records may move from `media_verified→scheduling→scheduled→published`, `scheduling→publishing→published`, either active state to `retryable` or `failed`, `retryable→scheduling|publishing`, and any not-yet-active record to `skipped_disabled|skipped_expired`. Never allow a terminal successful record to move backward.

`sanitizeError` must recursively reject keys matching `/authorization|token|secret|password|cookie|api[-_]?key/i`, bearer-like strings, Google resumable upload URLs, and values longer than 500 characters; persist only `{ category, message, statusCode?, retryAfterSeconds? }`. `writeCampaignState` validates before and after JSON serialization, writes to a sibling random temporary file using mode `0o600`, fsyncs it, then renames it. Create `state/index.json` as `{"schemaVersion":1,"campaigns":[]}` and `tests/support/state-fixture.ts` with a complete validated 2026-08-26 fixture whose optional argument accepts partial channel-stage overrides used by later orchestration tests.

- [ ] **Step 4: Run the complete state suite**

Run: `node --import tsx --test --test-name-pattern="provider transitions|tracked errors|atomically written" tests/*.test.ts`

Expected: all 3 tests PASS.

- [ ] **Step 5: Commit durable state**

```bash
git add src/state state/index.json tests/state.test.ts tests/support/state-fixture.ts
git commit -m "feat: add durable publication state"
```

## Task 3: Build and verify the rolling GitHub Pages payload

**Files:**
- Create: `src/media/manifest.ts`
- Create: `src/media/pages.ts`
- Create: `src/media/verify-public.ts`
- Create: `tests/pages-media.test.ts`

- [ ] **Step 1: Write failing rolling-window and public-hash tests**

```ts
// tests/pages-media.test.ts
import assert from "node:assert/strict";
import { createServer } from "node:http";
import test from "node:test";
import { datesInPagesPayload } from "../src/media/pages.js";
import { verifyPublicAsset } from "../src/media/verify-public.js";
import { sha256 } from "../src/shared/determinism.js";

test("Pages keeps two past and seven future dates", () => {
  assert.deepEqual(datesInPagesPayload("2026-08-26"), [
    "2026-08-24", "2026-08-25", "2026-08-26", "2026-08-27", "2026-08-28",
    "2026-08-29", "2026-08-30", "2026-08-31", "2026-09-01", "2026-09-02",
  ]);
});

test("public verification rejects a byte-hash mismatch", async (context) => {
  const server = createServer((_request, response) => { response.setHeader("content-type", "image/jpeg"); response.end("wrong"); });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  context.after(() => server.close());
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("Missing fake-server address");
  await assert.rejects(verifyPublicAsset({ url: `http://127.0.0.1:${address.port}/slide.jpg`,
    expectedHash: sha256("right"), expectedContentType: "image/jpeg", allowHttpForTest: true }), /hash mismatch/);
});
```

- [ ] **Step 2: Run media tests and verify failure**

Run: `node --import tsx --test --test-name-pattern="Pages keeps|byte-hash mismatch" tests/*.test.ts`

Expected: FAIL because the media modules do not exist.

- [ ] **Step 3: Implement stable paths, manifest, rolling copy, and HTTPS verification**

Use this public layout:

```text
.tmp/pages/media/2026-08-26/2026-08-26-troco-explains-v1-0/feed/slide-01.jpg
.tmp/pages/media/2026-08-26/2026-08-26-troco-explains-v1-0/video/short.mp4
.tmp/pages/media/2026-08-26/2026-08-26-troco-explains-v1-0/manifest.json
.tmp/pages/index.json
```

`createPagesPayload({ today, campaigns, renderRoot, pagesRoot })` must remove and recreate only the caller-supplied `.tmp/pages` directory, include dates from D-2 through D+7, validate every source media hash before copying, create one manifest per campaign, and write a top-level index. Reject symlinks, `..`, filenames outside the allowlist, and missing assets. Never delete or traverse the repository root.

`publicMediaUrls(pagesOrigin, record)` must percent-encode path segments and require that every resulting URL stays under the configured Pages origin. `verifyPublicAsset` performs a redirect-error GET with `cache: "no-store"`, requires status 200, exact content type, expected length when present, and SHA-256 over the received bytes. Production accepts HTTPS only; the explicit test option is unavailable through CLI code.

- [ ] **Step 4: Run the Pages media suite**

Run: `node --import tsx --test --test-name-pattern="Pages keeps|byte-hash mismatch" tests/*.test.ts`

Expected: both tests PASS.

- [ ] **Step 5: Commit Pages media lifecycle**

```bash
git add src/media tests/pages-media.test.ts
git commit -m "feat: stage and verify rolling public media"
```

## Task 4: Add Buffer GraphQL scheduling, preflight, and reconciliation

**Files:**
- Create: `src/networks/types.ts`
- Create: `src/networks/buffer/graphql.ts`
- Create: `src/networks/buffer/preflight.ts`
- Create: `src/networks/buffer/posts.ts`
- Create: `src/networks/buffer/reconcile.ts`
- Create: `tests/buffer.test.ts`

- [ ] **Step 1: Write fake-server tests for create, typed errors, and reconciliation**

```ts
// tests/buffer.test.ts
import assert from "node:assert/strict";
import test from "node:test";
import { createBufferPostInput, normalizeBufferCreateResponse } from "../src/networks/buffer/posts.js";
import { matchExistingBufferPost } from "../src/networks/buffer/reconcile.js";

test("Buffer uses custom scheduling and ordered public image assets", () => {
  const input = createBufferPostInput({ channel: "instagram", channelId: "ig_1", text: "Legenda",
    dueAt: "2026-08-26T15:17:00.000Z", mediaKind: "carousel",
    mediaUrls: ["https://trocohq.github.io/social-publisher/media/a.jpg", "https://trocohq.github.io/social-publisher/media/b.jpg"] });
  assert.deepEqual(input.assets, [
    { image: { url: "https://trocohq.github.io/social-publisher/media/a.jpg" } },
    { image: { url: "https://trocohq.github.io/social-publisher/media/b.jpg" } },
  ]);
  assert.equal(input.mode, "customScheduled");
  assert.equal(input.metadata.instagram.type, "post");
});

test("Buffer typed mutation errors become sanitized retry classes", () => {
  assert.deepEqual(normalizeBufferCreateResponse({ data: { createPost: { message: "Rate limit exceeded" } } }),
    { kind: "retryable_error", category: "buffer_rate_limit", message: "Buffer temporarily rejected the post" });
});

test("reconciliation matches channel, due time, normalized copy, and media", () => {
  const match = matchExistingBufferPost({ channelId: "ig_1", dueAt: "2026-08-26T15:17:00.000Z",
    text: "Troco certo", mediaUrls: ["https://example.test/slide.jpg"] }, [{ id: "post_1", channelId: "ig_1",
    dueAt: "2026-08-26T15:17:00.000Z", text: " Troco  certo ", status: "scheduled",
    assets: [{ source: "https://example.test/slide.jpg" }] }]);
  assert.equal(match?.id, "post_1");
});
```

- [ ] **Step 2: Run Buffer tests and verify failure**

Run: `node --import tsx --test --test-name-pattern="Buffer uses|Buffer typed|reconciliation matches" tests/*.test.ts`

Expected: FAIL because Buffer modules are missing.

- [ ] **Step 3: Implement variables-only GraphQL requests and provider adapters**

`graphql.ts` posts to `https://api.buffer.com` with `Authorization: Bearer <key>`, `Content-Type: application/json`, an abort timeout, and JSON `{ query, variables }`. Never interpolate channel IDs, text, dates, or URLs into the GraphQL document. Treat non-2xx, GraphQL `errors`, and typed mutation payloads separately; expose normalized auth, rate-limit, validation, capability, server, and network categories without raw response bodies.

Use this mutation:

```graphql
mutation CreateTrocoPost($input: CreatePostInput!) {
  createPost(input: $input) {
    ... on PostActionSuccess { post { id text status dueAt channelId assets { source mimeType } } }
    ... on MutationError { message }
  }
}
```

`createBufferPostInput` must set `schedulingType: "automatic"`, `mode: "customScheduled"`, `dueAt` in UTC, `needsApproval: false`, `aiAssisted: false`, and ordered assets. Image-led days use 2–5 image assets. Video-led days use one `{ video: { url, metadata: { thumbnailOffset: 2000 } } }`. Instagram sets `{ type: "post", shouldShareToFeed: true, isAiGenerated: false }` for images and `{ type: "reel", shouldShareToFeed: true, isAiGenerated: false }` for video. TikTok photo posts set `{ title, isAiGenerated: false }`; TikTok video sets `{ isAiGenerated: false }`.

`preflight.ts` queries the configured organization and asserts exactly three expected channel IDs with services `instagram`, `facebook`, and `tiktok`, all unpaused. Query future scheduled posts and fail if adding the seven-day window could exceed 10 scheduled posts on any channel. `reconcile.ts` queries scheduled and sent posts in a due-time window, normalizes copy, compares ordered asset URLs, and returns exactly one match; zero means safe to create, more than one is a permanent ambiguity incident.

- [ ] **Step 4: Run Buffer contract tests**

Run: `node --import tsx --test --test-name-pattern="Buffer uses|Buffer typed|reconciliation matches" tests/*.test.ts`

Expected: all 3 tests PASS.

- [ ] **Step 5: Commit Buffer delivery**

```bash
git add src/networks/types.ts src/networks/buffer tests/buffer.test.ts
git commit -m "feat: add idempotent Buffer scheduling"
```

## Task 5: Add YouTube OAuth, resumable upload, and duplicate lookup

**Files:**
- Create: `src/networks/youtube/oauth.ts`
- Create: `src/networks/youtube/upload.ts`
- Create: `src/networks/youtube/reconcile.ts`
- Create: `tests/youtube.test.ts`

- [ ] **Step 1: Write fake-transport tests for OAuth, upload metadata, and reconciliation**

```ts
// tests/youtube.test.ts
import assert from "node:assert/strict";
import test from "node:test";
import { youtubeVideoResource } from "../src/networks/youtube/upload.js";
import { campaignTag, matchYouTubeUpload } from "../src/networks/youtube/reconcile.js";

test("YouTube schedules a private upload with campaign fingerprint metadata", () => {
  const resource = youtubeVideoResource({ campaignId: "2026-08-26-troco-explains-v1-0",
    title: "Troco certo em segundos #Shorts", description: "Descrição", publishAt: "2026-08-26T15:17:00.000Z" });
  assert.equal(resource.status.privacyStatus, "private");
  assert.equal(resource.status.publishAt, "2026-08-26T15:17:00.000Z");
  assert.equal(resource.status.selfDeclaredMadeForKids, false);
  assert.ok(resource.snippet.tags.includes(campaignTag("2026-08-26-troco-explains-v1-0")));
});

test("YouTube reconciliation finds one authenticated upload by campaign tag", () => {
  assert.equal(matchYouTubeUpload("campaign-a", [
    { id: "video_1", snippet: { tags: [campaignTag("campaign-a")] }, status: { uploadStatus: "uploaded", privacyStatus: "private" } },
  ])?.id, "video_1");
});
```

- [ ] **Step 2: Run YouTube tests and verify failure**

Run: `node --import tsx --test --test-name-pattern="YouTube schedules|YouTube reconciliation" tests/*.test.ts`

Expected: FAIL because YouTube modules are missing.

- [ ] **Step 3: Implement token refresh, resumable upload, and uploads-playlist lookup**

`oauth.ts` sends URL-encoded `client_id`, `client_secret`, `refresh_token`, and `grant_type=refresh_token` to `https://oauth2.googleapis.com/token`, keeps the access token in memory only, refreshes 60 seconds before expiry, and never returns it from logging or state APIs.

`youtubeVideoResource` must set category `27`, language `pt-BR`, tags `Troco`, `troco certo`, `caixa`, `Shorts`, and `troco_campaign_<sha256(campaignId).slice(0,24)>`; set `privacyStatus: "private"`, future `publishAt`, `selfDeclaredMadeForKids: false`, `embeddable: true`, and `license: "youtube"`. Reject past scheduling except when target local date is today, in which case omit `publishAt` and request public only after the controlled activation gate has proven project verification.

`upload.ts` starts a session at `https://www.googleapis.com/upload/youtube/v3/videos?uploadType=resumable&part=snippet,status`, validates the returned `Location` origin, uploads the local MP4 by PUT with exact content length/type, handles 308 range responses, and normalizes the final ID/status. A resumable URL remains process-local and is never persisted or logged.

`reconcile.ts` calls `channels.list(part=contentDetails,mine=true)`, reads the authenticated uploads playlist with `playlistItems.list`, fetches video tags/status with `videos.list`, and returns exactly one matching campaign tag. Zero permits a new upload; multiple matches create a permanent ambiguity error.

- [ ] **Step 4: Run YouTube tests**

Run: `node --import tsx --test --test-name-pattern="YouTube schedules|YouTube reconciliation" tests/*.test.ts`

Expected: both tests PASS.

- [ ] **Step 5: Commit YouTube delivery**

```bash
git add src/networks/youtube tests/youtube.test.ts
git commit -m "feat: add idempotent YouTube Shorts delivery"
```

## Task 6: Orchestrate one safely persisted provider action at a time

**Files:**
- Create: `src/publishing/next-action.ts`
- Create: `src/publishing/intent.ts`
- Create: `src/publishing/execute.ts`
- Create: `tests/publishing.test.ts`

- [ ] **Step 1: Write failing isolated-retry and reconciliation-first tests**

```ts
// tests/publishing.test.ts
import assert from "node:assert/strict";
import test from "node:test";
import { nextPublicationAction } from "../src/publishing/next-action.js";
import { executePublication } from "../src/publishing/execute.js";
import { campaignStateFixture } from "./support/state-fixture.js";

test("the next action skips successful siblings and selects one retryable channel", () => {
  const state = campaignStateFixture({ instagram: "scheduled", facebook: "retryable", tiktok: "scheduled", youtube: "scheduled" });
  assert.deepEqual(nextPublicationAction([state], new Date("2026-08-26T10:00:00Z")), {
    campaignId: state.plan.id, localDate: "2026-08-26", channel: "facebook", phase: "scheduling",
  });
});

test("execution records a reconciled provider object without creating another", async () => {
  let createCalls = 0;
  const result = await executePublication({ state: campaignStateFixture({ instagram: "scheduling" }), channel: "instagram",
    reconcile: async () => ({ id: "existing_1", dueAt: "2026-08-26T15:17:00Z", status: "scheduled" }),
    create: async () => { createCalls += 1; throw new Error("must not create"); }, now: new Date("2026-08-26T10:00:00Z") });
  assert.equal(createCalls, 0);
  assert.equal(result.channels.instagram.providerId, "existing_1");
  assert.equal(result.channels.instagram.stage, "scheduled");
});
```

- [ ] **Step 2: Run publishing tests and verify failure**

Run: `node --import tsx --test --test-name-pattern="next action|reconciled provider" tests/*.test.ts`

Expected: FAIL because publishing orchestration modules are missing.

- [ ] **Step 3: Implement deterministic action selection, intent, and execution**

`nextPublicationAction` sorts campaigns by local date, then channels in `instagram`, `facebook`, `tiktok`, `youtube` order. It ignores expired earlier dates, never backfills, keeps today eligible until 23:59:59 São Paulo, and returns only one action. `intent.ts` accepts an action and transitions only its channel to `scheduling` or `publishing`, increments attempts, records the timestamp, and atomically writes state; it has no network imports.

`executePublication` requires an already-persisted active intent. It calls reconciliation first. If a match exists, normalize and persist it. If none exists, call the injected provider write once. Temporary network/429/5xx errors move only that channel to `retryable`; auth/config/unsupported media move only that channel to `failed` and stop further actions for that provider; successful siblings remain unchanged. Map future accepted objects to `scheduled`, same-day immediate accepted objects to `publishing`, and confirmed sent objects to `published`.

- [ ] **Step 4: Run orchestrator tests**

Run: `node --import tsx --test --test-name-pattern="next action|reconciled provider" tests/*.test.ts`

Expected: both tests PASS.

- [ ] **Step 5: Commit publication orchestration**

```bash
git add src/publishing tests/publishing.test.ts
git commit -m "feat: orchestrate isolated social publication"
```

## Task 7: Add workflow CLIs and controlled activation gates

**Files:**
- Create: `src/cli/plan.ts`
- Create: `src/cli/next-action.ts`
- Create: `src/cli/publish.ts`
- Create: `src/cli/reconcile.ts`
- Create: `src/cli/preflight.ts`
- Create: `tests/cli-gates.test.ts`
- Modify: `package.json`

- [ ] **Step 1: Write failing manual-gate and disabled-schedule tests**

```ts
// tests/cli-gates.test.ts
import assert from "node:assert/strict";
import test from "node:test";
import { parsePublishRequest } from "../src/cli/publish.js";

test("scheduled provider writes remain disabled until AUTO_PUBLISH is true", () => {
  assert.throws(() => parsePublishRequest({ mode: "scheduled", autoPublish: false }), /disabled/);
});

test("controlled execution requires an exact campaign and confirmation", () => {
  assert.deepEqual(parsePublishRequest({ mode: "controlled", autoPublish: false,
    campaignId: "2026-08-27-quick-calculation-v1-0", confirmation: "PUBLISH_ONE_CAMPAIGN" }),
    { mode: "controlled", campaignId: "2026-08-27-quick-calculation-v1-0" });
  assert.throws(() => parsePublishRequest({ mode: "controlled", autoPublish: false,
    campaignId: "2026-08-27-quick-calculation-v1-0", confirmation: "publish" }), /PUBLISH_ONE_CAMPAIGN/);
});
```

- [ ] **Step 2: Run gate tests and verify failure**

Run: `node --import tsx --test --test-name-pattern="scheduled provider|controlled execution" tests/*.test.ts`

Expected: FAIL because workflow CLI modules are missing.

- [ ] **Step 3: Implement narrow commands with JSON-only summaries**

Add scripts:

```json
{
  "plan": "node --import tsx src/cli/plan.ts",
  "next-action": "node --import tsx src/cli/next-action.ts",
  "preflight": "node --import tsx src/cli/preflight.ts",
  "publish": "node --import tsx src/cli/publish.ts",
  "reconcile": "node --import tsx src/cli/reconcile.ts",
  "incident": "node --import tsx src/cli/incident.ts"
}
```

`plan` replenishes today through D+6, renders missing assets, validates them, creates the D-2/D+7 Pages payload, and updates only planned/rendered/media stages. `preflight` validates sources, account/channel capability, origin, queue capacity, and the mode gate without creating a post. `next-action` is the one machine-oriented exception to JSON summaries: it prints exactly `none` or one validated campaign ID followed by a colon and channel, such as `2026-08-27-quick-calculation-v1-0:instagram`, and no other stdout. `publish --phase intent|execute --action 2026-08-27-quick-calculation-v1-0:instagram` performs exactly the named phase. `reconcile` reads provider state but performs no creates. Every other command prints one final sanitized JSON object and returns a nonzero exit for invalid gates or state.

- [ ] **Step 4: Run CLI gate and dry-run regression tests**

Run: `node --import tsx --test --test-name-pattern="scheduled provider|controlled execution|complete review bundle" tests/*.test.ts`

Expected: all named tests PASS and dry-run remains read-only.

- [ ] **Step 5: Commit workflow commands**

```bash
git add src/cli package.json package-lock.json tests/cli-gates.test.ts
git commit -m "feat: add controlled publication commands"
```

## Task 8: Maintain one sanitized GitHub incident through recovery

**Files:**
- Create: `src/incidents/github.ts`
- Create: `src/cli/incident.ts`
- Create: `tests/incidents.test.ts`

- [ ] **Step 1: Write failing incident lifecycle tests**

```ts
// tests/incidents.test.ts
import assert from "node:assert/strict";
import test from "node:test";
import { incidentMutation } from "../src/incidents/github.js";

test("a repeated failure updates one labeled incident and recovery closes it", () => {
  const active = { number: 17, state: "open", labels: [{ name: "social-publisher-incident" }] };
  assert.deepEqual(incidentMutation("failure", active), { kind: "update", issueNumber: 17 });
  assert.deepEqual(incidentMutation("recovery", active), { kind: "close", issueNumber: 17 });
  assert.deepEqual(incidentMutation("recovery", undefined), { kind: "none" });
});
```

- [ ] **Step 2: Run incident tests and verify failure**

Run: `node --import tsx --test --test-name-pattern="repeated failure" tests/*.test.ts`

Expected: FAIL because incident handling is missing.

- [ ] **Step 3: Implement one-issue incident handling**

Query open issues with label `social-publisher-incident`. On failure create one issue if absent, otherwise append a sanitized occurrence summary to the existing issue. The title is `Social publisher incident`; the body includes campaign ID, channel/stage, category, first/last observed timestamps, attempts, and the Actions run URL, but no raw provider payload. On a fully healthy reconciliation, append a recovery note and close the open issue. Reject multiple open labeled incidents as a configuration error instead of choosing one.

- [ ] **Step 4: Run incident tests**

Run: `node --import tsx --test --test-name-pattern="repeated failure" tests/*.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit incident lifecycle**

```bash
git add src/incidents src/cli/incident.ts tests/incidents.test.ts
git commit -m "feat: report publisher incidents"
```

## Task 9: Add conflict-aware state commits and pinned GitHub workflows

**Files:**
- Create: `scripts/commit-state.sh`
- Create: `.github/workflows/validate.yml`
- Create: `.github/workflows/publish.yml`
- Create: `tests/workflows.test.ts`

- [ ] **Step 1: Write failing workflow security and schedule contracts**

```ts
// tests/workflows.test.ts
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("production workflow is serialized, disabled by default, and runs every three hours", async () => {
  const workflow = await readFile(new URL("../.github/workflows/publish.yml", import.meta.url), "utf8");
  assert.match(workflow, /cron: ['"]17 \*\/3 \* \* \*['"]/);
  assert.match(workflow, /group: troco-social-publication/);
  assert.match(workflow, /cancel-in-progress: false/);
  assert.match(workflow, /AUTO_PUBLISH: \$\{\{ vars\.AUTO_PUBLISH \|\| 'false' \}\}/);
  assert.doesNotMatch(workflow, /pull_request:/);
});

test("every third-party action is pinned to a full commit SHA", async () => {
  const files = ["validate.yml", "publish.yml"];
  for (const file of files) {
    const workflow = await readFile(new URL(`../.github/workflows/${file}`, import.meta.url), "utf8");
    for (const line of workflow.split("\n").filter((value) => value.includes("uses:"))) {
      assert.match(line, /@[0-9a-f]{40}(?:\s|$)/);
    }
  }
});
```

- [ ] **Step 2: Run workflow tests and verify failure**

Run: `node --import tsx --test --test-name-pattern="production workflow|third-party action" tests/*.test.ts`

Expected: FAIL because the workflow files do not exist.

- [ ] **Step 3: Implement state-only commit script and validation workflow**

`scripts/commit-state.sh` must use `set -euo pipefail`, accept only a message argument, add only `state/index.json` and `state/campaigns/*.json`, exit without a commit when unchanged, commit as `github-actions[bot]`, push `HEAD:${GITHUB_REF_NAME}`, and on non-fast-forward perform `git fetch origin "$GITHUB_REF_NAME"`, `git rebase "origin/$GITHUB_REF_NAME"`, `npm run validate`, then push. It must never stage `.tmp`, media, logs, or environment files.

`validate.yml` runs on pull requests and source pushes with `contents: read`; checks out publisher, canonical `trocohq/frontend` at `298381c8e6c3220cde11a8109ddb727a28223d7c`, and canonical `trocohq/design-tokens` at `1fefd27a0de14a8d4115fe79c6076a3b17d3cf6d`, using `SOURCE_READ_TOKEN` only for those two read-only checkouts; configures the GitHub Packages registry; compares the checked-out token source to `@trocohq/design-tokens@0.1.2`; runs `npm ci`, `npm run check`, and `npm run validate`; creates a dry-run review; and uploads it for 3 days. Pin:

```yaml
uses: actions/checkout@34e114876b0b11c390a56381ad16ebd13914f8d5 # v4.3.1
uses: actions/setup-node@49933ea5288caeca8642d1e84afbd3f7d6820020 # v4.4.0
uses: actions/upload-artifact@ea165f8d65b6e75b540449e92b4886f43607fa02 # v4.6.2
```

- [ ] **Step 4: Implement the serialized Pages and provider workflow**

`publish.yml` uses `schedule: '17 */3 * * *'` and `workflow_dispatch` modes `dry-run`, `controlled`, and `scheduled`. It runs only on the default branch, declares `contents: write`, `pages: write`, `id-token: write`, and `issues: write`, uses concurrency group `troco-social-publication`, and never handles `pull_request`.

Use this order in one job so each state commit precedes its provider write:

```yaml
- run: npm run plan -- --state state --render-root .tmp/render --pages-root .tmp/pages
- run: scripts/commit-state.sh "chore(state): record campaign plans [skip ci]"
- uses: actions/upload-pages-artifact@fc324d3547104276b827a68afc52ff2a11cc49c9 # v5.0.0
  with: { path: .tmp/pages }
- id: deployment
  uses: actions/deploy-pages@cd2ce8fcbc39b97be8ca5fce6e763baed58fa128 # v5.0.0
- run: npm run preflight -- --verify-public
- run: |
    for iteration in {1..28}; do
      action="$(npm run --silent next-action)"
      if [[ "$action" == "none" ]]; then break; fi
      node --import tsx src/cli/publish.ts --phase intent --action "$action"
      scripts/commit-state.sh "chore(state): record publication intent [skip ci]"
      node --import tsx src/cli/publish.ts --phase execute --action "$action"
      scripts/commit-state.sh "chore(state): record publication result [skip ci]"
    done
- run: npm run reconcile
- run: npm run incident -- recovery
```

Pass provider secrets only to preflight/execute/reconcile steps. Wrap the operational sequence so a sanitized `npm run incident -- failure` executes on error, then return the original nonzero status. Scheduled mode must exit before Pages or provider writes unless `AUTO_PUBLISH == 'true'`; controlled mode requires `PUBLISH_ONE_CAMPAIGN` and one future campaign; dry-run uploads a review artifact but never commits state, deploys Pages, or calls providers.

- [ ] **Step 5: Run workflow contracts and syntax validation**

Run: `node --import tsx --test --test-name-pattern="production workflow|third-party action" tests/*.test.ts && npm run typecheck && ruby -e 'require "yaml"; Dir[".github/workflows/*.yml"].each { |f| YAML.load_file(f, aliases: true) }'`

Expected: workflow tests PASS, TypeScript exits `0`, and both YAML files parse.

- [ ] **Step 6: Commit workflows**

```bash
chmod +x scripts/commit-state.sh
git add scripts/commit-state.sh .github/workflows tests/workflows.test.ts
git commit -m "ci: automate daily social publication"
```

## Task 10: Document controlled activation and verify the production boundary

**Files:**
- Create: `docs/operations.md`
- Modify: `README.md`
- Modify: `src/validation/run.ts`
- Create: `tests/operations-doc.test.ts`

- [ ] **Step 1: Write a failing activation-document contract**

```ts
// tests/operations-doc.test.ts
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("operations document keeps unattended publication behind verified activation", async () => {
  const document = await readFile(new URL("../docs/operations.md", import.meta.url), "utf8");
  for (const phrase of ["AUTO_PUBLISH=false", "PUBLISH_ONE_CAMPAIGN", "Buffer", "YouTube", "GitHub Pages",
    "private", "verification", "token rotation", "never backfills"]) {
    assert.match(document, new RegExp(phrase, "i"));
  }
});
```

- [ ] **Step 2: Run the operations test and verify failure**

Run: `node --import tsx --test --test-name-pattern="unattended publication" tests/*.test.ts`

Expected: FAIL because `docs/operations.md` is absent.

- [ ] **Step 3: Write the exact one-time operator runbook**

Document, in order: create the public repository and enable GitHub Pages; create a free Buffer account; connect Instagram, Facebook, and TikTok; record organization and channel IDs; create the personal API key; create/authorize the Google project and refresh token for the owning YouTube channel; complete the YouTube audit needed for public API uploads; add repository variables and secrets; verify canonical source SHAs; run validation; inspect the review artifact; run one future controlled Buffer campaign; upload its YouTube variant privately; confirm provider IDs/media/copy/links; verify reconciliation; set `AUTO_PUBLISH=true`; and monitor the first seven days. Include token rotation, disabling one provider, retrying one failed stage, closing incidents, Pages retention, and the no-backfill rule.

Update `README.md` with the delivery architecture, the provider/post URL attribution trail, the fact that download growth is evaluated manually in Google Play Console, the explicit exclusion of automatic Play Console ingestion, and a link to operations. Extend `src/validation/run.ts` to validate every tracked campaign, reject suspicious key names, check workflow gates, and execute fake-server integration tests without real credentials.

- [ ] **Step 4: Run all verification without provider secrets**

Run: `npm run format && npm run check && npm run validate && npm run dry-run -- --date 2026-08-26 --brand-root ../frontend/public --output .tmp/final-review --ffmpeg /opt/homebrew/bin/ffmpeg --ffprobe /opt/homebrew/bin/ffprobe && git status --short`

Expected: formatting, typecheck, unit/integration tests, render validation, workflow contracts, and dry run all exit `0`; no provider call occurs; only intended documentation/validation changes remain.

- [ ] **Step 5: Commit the delivery runbook**

```bash
git add docs/operations.md README.md src/validation/run.ts tests/operations-doc.test.ts
git commit -m "docs: add social publisher operations runbook"
```

## Delivery-plan completion gate

Before any controlled provider write:

```bash
npm run check
npm run validate
npm run dry-run -- --date 2026-08-27 --brand-root ../frontend/public --output .tmp/activation-review
git status --short
```

Expected: all commands exit `0`, the review bundle has been inspected, the working tree is clean, `AUTO_PUBLISH=false`, and repository/provider credentials exist only as GitHub Actions secrets. Code completion does not waive Buffer account setup or YouTube verification; unattended public activation happens only after the documented controlled checks succeed.
