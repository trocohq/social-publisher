# Published Thumbnail Backfill Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Generate deterministic covers for the two immutable published campaigns, update their existing YouTube Shorts through a controlled API operation, and audit native Instagram and Facebook cover changes without replacing any post.

**Architecture:** A focused backfill package validates one exact published campaign, renders only the existing thumbnail SVG, and stores maintenance outcomes outside immutable campaign state. A YouTube thumbnail adapter reuses the existing OAuth and campaign-tag resolver, while Meta changes remain native-browser operations whose observed results are recorded through the same guarded CLI.

**Tech Stack:** TypeScript ESM, Node.js 24, Zod, Sharp, YouTube Data API v3, Node test runner, Prettier.

---

## File map

- Create `src/backfill/schema.ts`: strict maintenance-audit types, initialization,
  hash compatibility, and outcome transitions.
- Create `src/backfill/storage.ts`: atomic read/write operations below
  `state/thumbnail-backfills/`.
- Create `src/backfill/prepare.ts`: exact candidate selection, historical cover
  rendering, 2 MB validation, and local review output.
- Create `src/backfill/service.ts`: idempotent YouTube execution and native Meta
  outcome recording.
- Create `src/networks/youtube/thumbnail.ts`: authenticated custom-thumbnail
  upload and provider verification.
- Create `src/cli/backfill-thumbnails.ts`: controlled prepare, execute, and record
  modes with exact confirmations.
- Create `tests/thumbnail-backfill.test.ts`: audit, storage, renderer, service,
  and immutable-state contracts.
- Create `tests/youtube-thumbnail.test.ts`: HTTP, size, authorization, and error
  contracts for YouTube thumbnail writes.
- Create `tests/backfill-cli.test.ts`: CLI parsing and execution gates.
- Modify `package.json`: expose `backfill-thumbnails`.
- Modify `README.md`, `docs/operations.md`, and
  `tests/package-contract.test.ts`: document the controlled backfill.

The user selected direct work on `main`, frequent local micro-commits, and no
push. Preserve `.DS_Store` and `.superpowers/` as untracked files.

### Task 1: Define strict backfill audit state

**Files:**

- Create: `src/backfill/schema.ts`
- Create: `src/backfill/storage.ts`
- Create: `tests/thumbnail-backfill.test.ts`

- [ ] **Step 1: Write the failing audit and storage tests**

Create `tests/thumbnail-backfill.test.ts` with these initial tests:

```ts
import assert from "node:assert/strict";
import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import {
  assertMatchingThumbnail,
  createThumbnailBackfillAudit,
  recordThumbnailBackfillOutcome,
} from "../src/backfill/schema.js";
import {
  readThumbnailBackfill,
  writeThumbnailBackfill,
} from "../src/backfill/storage.js";

const campaignId = "2026-08-27-quick-calculation-v1-0";
const thumbnail = {
  hash: "a".repeat(64),
  width: 1080 as const,
  height: 1920 as const,
  format: "jpeg" as const,
};

test("thumbnail backfill audit is strict, atomic, and channel independent", async () => {
  const root = await mkdtemp(join(tmpdir(), "troco-thumbnail-backfill-"));
  const initial = createThumbnailBackfillAudit({
    campaignId,
    thumbnail,
    bufferProviderIds: {
      instagram: "buffer_ig",
      facebook: "buffer_fb",
      youtube: "buffer_yt",
    },
  });
  const updated = recordThumbnailBackfillOutcome({
    audit: initial,
    channel: "youtube",
    outcome: {
      status: "updated",
      nativeProviderId: "youtube_1",
      permalink: "https://www.youtube.com/watch?v=youtube_1",
    },
    now: new Date("2026-08-28T18:00:00Z"),
  });

  await writeThumbnailBackfill(root, updated);
  assert.deepEqual(await readThumbnailBackfill(root, campaignId), updated);
  assert.equal(updated.channels.youtube.attempts, 1);
  assert.equal(updated.channels.youtube.status, "updated");
  assert.equal(updated.channels.instagram.status, "pending");
  const bytes = await readFile(
    join(root, "thumbnail-backfills", `${campaignId}.json`),
    "utf8",
  );
  assert.match(bytes, /"schemaVersion": 1/u);
  assert.doesNotMatch(bytes, /access.?token|authorization|secret/iu);
});

test("a successful audit cannot silently accept a different thumbnail", () => {
  const audit = createThumbnailBackfillAudit({
    campaignId,
    thumbnail,
    bufferProviderIds: {},
  });
  assert.throws(
    () =>
      assertMatchingThumbnail(audit, {
        ...thumbnail,
        hash: "b".repeat(64),
      }),
    /thumbnail hash changed/i,
  );
});

test("a successful retry clears the previous sanitized failure", () => {
  const initial = createThumbnailBackfillAudit({
    campaignId,
    thumbnail,
    bufferProviderIds: { facebook: "buffer_fb" },
  });
  const failed = recordThumbnailBackfillOutcome({
    audit: initial,
    channel: "facebook",
    outcome: {
      status: "failed",
      lastError: {
        category: "native_thumbnail_update",
        message: "Native cover update failed during controlled review",
      },
    },
    now: new Date("2026-08-28T18:00:00Z"),
  });
  const recovered = recordThumbnailBackfillOutcome({
    audit: failed,
    channel: "facebook",
    outcome: { status: "updated" },
    now: new Date("2026-08-28T18:05:00Z"),
  });
  assert.equal(recovered.channels.facebook.status, "updated");
  assert.equal(recovered.channels.facebook.attempts, 2);
  assert.equal(recovered.channels.facebook.lastError, undefined);
});

test("missing audit files return undefined", async () => {
  const root = await mkdtemp(join(tmpdir(), "troco-thumbnail-backfill-"));
  assert.equal(await readThumbnailBackfill(root, campaignId), undefined);
});
```

- [ ] **Step 2: Run the focused test and verify RED**

Run:

```bash
PATH=/Users/guilherme/.nvm/versions/node/v24.14.1/bin:/opt/homebrew/bin:/usr/bin:/bin node --import tsx --test tests/thumbnail-backfill.test.ts
```

Expected: FAIL because the two backfill modules do not exist.

- [ ] **Step 3: Implement the strict audit schema and transitions**

Create `src/backfill/schema.ts` with these public contracts:

```ts
import { z } from "zod";

import { sanitizedErrorSchema, type SanitizedError } from "../state/schema.js";

export const thumbnailBackfillCampaignIdSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}-[a-z0-9-]+-v\d+-\d+$/);
const hashSchema = z.string().regex(/^[a-f0-9]{64}$/);

export const thumbnailBackfillChannelSchema = z.enum([
  "instagram",
  "facebook",
  "youtube",
]);
export type ThumbnailBackfillChannel = z.infer<
  typeof thumbnailBackfillChannelSchema
>;

export const thumbnailBackfillStatusSchema = z.enum([
  "pending",
  "updated",
  "unsupported",
  "not_found",
  "failed",
]);
export type ThumbnailBackfillStatus = z.infer<
  typeof thumbnailBackfillStatusSchema
>;

export const backfillThumbnailSchema = z
  .object({
    hash: hashSchema,
    width: z.literal(1080),
    height: z.literal(1920),
    format: z.literal("jpeg"),
  })
  .strict();
export type BackfillThumbnail = z.infer<typeof backfillThumbnailSchema>;

const channelRecordSchema = z
  .object({
    status: thumbnailBackfillStatusSchema,
    attempts: z.number().int().nonnegative(),
    bufferProviderId: z.string().min(1).max(300).optional(),
    nativeProviderId: z.string().min(1).max(300).optional(),
    permalink: z
      .url()
      .refine((value) => value.startsWith("https://"))
      .optional(),
    attemptedAt: z.iso.datetime({ offset: true }).optional(),
    verifiedAt: z.iso.datetime({ offset: true }).optional(),
    lastError: sanitizedErrorSchema.optional(),
  })
  .strict()
  .superRefine((record, context) => {
    if (record.status !== "pending" && !record.attemptedAt) {
      context.addIssue({
        code: "custom",
        message: "A completed backfill outcome requires attemptedAt",
      });
    }
    if (record.status === "updated" && !record.verifiedAt) {
      context.addIssue({
        code: "custom",
        message: "An updated cover requires verifiedAt",
      });
    }
    if (record.status === "failed" && !record.lastError) {
      context.addIssue({
        code: "custom",
        message: "A failed cover requires a sanitized error",
      });
    }
    if (record.status !== "failed" && record.lastError) {
      context.addIssue({
        code: "custom",
        message: "Only failed covers may store an error",
      });
    }
  });

export const thumbnailBackfillAuditSchema = z
  .object({
    schemaVersion: z.literal(1),
    campaignId: thumbnailBackfillCampaignIdSchema,
    thumbnail: backfillThumbnailSchema,
    channels: z
      .object({
        instagram: channelRecordSchema,
        facebook: channelRecordSchema,
        youtube: channelRecordSchema,
      })
      .strict(),
  })
  .strict()
  .superRefine((audit, context) => {
    const youtube = audit.channels.youtube;
    if (youtube.status === "updated" && !youtube.nativeProviderId) {
      context.addIssue({
        code: "custom",
        message: "An updated YouTube cover requires its native video ID",
        path: ["channels", "youtube", "nativeProviderId"],
      });
    }
  });
export type ThumbnailBackfillAudit = z.infer<
  typeof thumbnailBackfillAuditSchema
>;

type BufferProviderIds = Readonly<
  Partial<Record<ThumbnailBackfillChannel, string>>
>;

export function createThumbnailBackfillAudit({
  campaignId,
  thumbnail,
  bufferProviderIds,
}: Readonly<{
  campaignId: string;
  thumbnail: BackfillThumbnail;
  bufferProviderIds: BufferProviderIds;
}>): ThumbnailBackfillAudit {
  const pending = (channel: ThumbnailBackfillChannel) => ({
    status: "pending" as const,
    attempts: 0,
    ...(bufferProviderIds[channel]
      ? { bufferProviderId: bufferProviderIds[channel] }
      : {}),
  });
  return thumbnailBackfillAuditSchema.parse({
    schemaVersion: 1,
    campaignId,
    thumbnail,
    channels: {
      instagram: pending("instagram"),
      facebook: pending("facebook"),
      youtube: pending("youtube"),
    },
  });
}

export function assertMatchingThumbnail(
  audit: ThumbnailBackfillAudit,
  thumbnail: BackfillThumbnail,
): void {
  if (audit.thumbnail.hash !== thumbnail.hash) {
    throw new Error("Published thumbnail hash changed after audit creation");
  }
}

export type ThumbnailBackfillOutcome =
  | Readonly<{
      status: "updated";
      nativeProviderId?: string;
      permalink?: string;
    }>
  | Readonly<{ status: "unsupported" | "not_found" }>
  | Readonly<{ status: "failed"; lastError: SanitizedError }>;

export function recordThumbnailBackfillOutcome({
  audit,
  channel,
  outcome,
  now,
}: Readonly<{
  audit: ThumbnailBackfillAudit;
  channel: ThumbnailBackfillChannel;
  outcome: ThumbnailBackfillOutcome;
  now: Date;
}>): ThumbnailBackfillAudit {
  if (Number.isNaN(now.valueOf())) throw new Error("Invalid backfill clock");
  const current = audit.channels[channel];
  if (current.status === "updated") {
    throw new Error(`Thumbnail already updated for ${channel}`);
  }
  const stable = {
    attempts: current.attempts,
    ...(current.bufferProviderId
      ? { bufferProviderId: current.bufferProviderId }
      : {}),
  };
  const next = {
    ...stable,
    status: outcome.status,
    attempts: current.attempts + 1,
    attemptedAt: now.toISOString(),
    ...(outcome.status === "updated"
      ? {
          verifiedAt: now.toISOString(),
          ...(outcome.nativeProviderId
            ? { nativeProviderId: outcome.nativeProviderId }
            : {}),
          ...(outcome.permalink ? { permalink: outcome.permalink } : {}),
        }
      : {}),
    ...(outcome.status === "failed" ? { lastError: outcome.lastError } : {}),
  };
  return thumbnailBackfillAuditSchema.parse({
    ...audit,
    channels: { ...audit.channels, [channel]: next },
  });
}
```

- [ ] **Step 4: Implement atomic backfill storage**

Create `src/backfill/storage.ts`:

```ts
import { randomUUID } from "node:crypto";
import { mkdir, open, readFile, rename } from "node:fs/promises";
import { join } from "node:path";

import {
  thumbnailBackfillCampaignIdSchema,
  thumbnailBackfillAuditSchema,
  type ThumbnailBackfillAudit,
} from "./schema.js";

function auditPath(root: string, campaignId: string): string {
  const parsed = thumbnailBackfillCampaignIdSchema.parse(campaignId);
  return join(root, "thumbnail-backfills", `${parsed}.json`);
}

export async function readThumbnailBackfill(
  root: string,
  campaignId: string,
): Promise<ThumbnailBackfillAudit | undefined> {
  try {
    return thumbnailBackfillAuditSchema.parse(
      JSON.parse(await readFile(auditPath(root, campaignId), "utf8")),
    );
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return undefined;
    throw error;
  }
}

export async function writeThumbnailBackfill(
  root: string,
  input: ThumbnailBackfillAudit,
): Promise<void> {
  const audit = thumbnailBackfillAuditSchema.parse(input);
  const directory = join(root, "thumbnail-backfills");
  await mkdir(directory, { recursive: true });
  const target = auditPath(root, audit.campaignId);
  const temporary = `${target}.${process.pid}.${randomUUID()}.tmp`;
  const handle = await open(temporary, "wx", 0o600);
  try {
    await handle.writeFile(`${JSON.stringify(audit, null, 2)}\n`, "utf8");
    await handle.sync();
  } finally {
    await handle.close();
  }
  await rename(temporary, target);
}
```

- [ ] **Step 5: Run focused tests and verify GREEN**

Run the Task 1 test command again.

Expected: 4 tests pass and 0 fail.

- [ ] **Step 6: Commit the audit contract**

```bash
git add src/backfill/schema.ts src/backfill/storage.ts tests/thumbnail-backfill.test.ts
git commit -m "feat: add thumbnail backfill audit"
```

### Task 2: Render and review immutable historical covers

**Files:**

- Create: `src/backfill/prepare.ts`
- Modify: `tests/thumbnail-backfill.test.ts`

- [ ] **Step 1: Add failing eligibility, rendering, and immutability tests**

Append these imports and tests to `tests/thumbnail-backfill.test.ts`:

```ts
import { stat } from "node:fs/promises";

import {
  preparePublishedThumbnail,
  requirePublishedBackfillChannel,
} from "../src/backfill/prepare.js";
import { campaignStateSchema } from "../src/state/schema.js";
import { canonicalBrandRoot } from "./support/brand-root.js";
import { campaignStateFixture } from "./support/state-fixture.js";

function historicalPublishedState() {
  const state = campaignStateFixture({
    instagram: "published",
    facebook: "published",
    tiktok: "skipped_disabled",
    youtube: "published",
  });
  return campaignStateSchema.parse({
    ...state,
    channels: Object.fromEntries(
      Object.entries(state.channels).map(([channel, record]) => [
        channel,
        record.stage === "published"
          ? { ...record, providerId: `buffer_${channel}` }
          : record,
      ]),
    ),
  });
}

test("only an exact published campaign and channel are eligible", () => {
  const state = historicalPublishedState();
  assert.equal(
    requirePublishedBackfillChannel(state, state.plan.id, "instagram")
      .providerId,
    state.channels.instagram.providerId,
  );
  assert.throws(
    () =>
      requirePublishedBackfillChannel(
        state,
        `${state.plan.id}-wrong`,
        "instagram",
      ),
    /does not match/i,
  );
  assert.throws(
    () => requirePublishedBackfillChannel(state, state.plan.id, "youtube"),
    /published provider ID/i,
  );
});

test("historical preparation writes a provider-ready cover and no durable state", async () => {
  const root = await mkdtemp(join(tmpdir(), "troco-thumbnail-prepare-"));
  const publishedState = historicalPublishedState();
  const before = JSON.stringify(publishedState);

  const prepared = await preparePublishedThumbnail({
    state: publishedState,
    campaignId: publishedState.plan.id,
    brandRoot: canonicalBrandRoot(),
    outputRoot: root,
  });

  assert.equal(JSON.stringify(publishedState), before);
  assert.deepEqual(
    [
      prepared.thumbnail.width,
      prepared.thumbnail.height,
      prepared.thumbnail.format,
    ],
    [1080, 1920, "jpeg"],
  );
  assert.ok((await stat(prepared.thumbnail.file)).size <= 2_000_000);
  assert.match(
    await readFile(prepared.reviewHtml, "utf8"),
    /ALTERE SOMENTE A CAPA/u,
  );
  assert.match(
    await readFile(prepared.reviewJson, "utf8"),
    /buffer_instagram/u,
  );
  assert.equal(
    await readThumbnailBackfill(root, publishedState.plan.id),
    undefined,
  );
});
```

- [ ] **Step 2: Run the focused test and verify RED**

Run the Task 1 command.

Expected: FAIL because `prepare.ts` does not exist.

- [ ] **Step 3: Implement exact candidate selection and historical rendering**

Create `src/backfill/prepare.ts` with:

```ts
import { randomUUID } from "node:crypto";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { join, relative, resolve } from "node:path";

import { loadBrand } from "../brand/load-brand.js";
import { renderVideoThumbnail } from "../render/thumbnail.js";
import { createVerticalThumbnailSvg, escapeXml } from "../render/svg.js";
import type { CampaignState } from "../state/schema.js";
import type { BackfillThumbnail, ThumbnailBackfillChannel } from "./schema.js";

const MAXIMUM_YOUTUBE_THUMBNAIL_BYTES = 2_000_000;
const channels = ["instagram", "facebook", "youtube"] as const;

export function requirePublishedBackfillChannel(
  state: CampaignState,
  campaignId: string,
  channel: ThumbnailBackfillChannel,
) {
  if (state.plan.id !== campaignId) {
    throw new Error("Backfill campaign does not match immutable state");
  }
  if (state.plan.localDate > "2026-08-28") {
    throw new Error("Campaign already uses the current thumbnail contract");
  }
  const record = state.channels[channel];
  if (record.stage !== "published") {
    throw new Error(`Backfill requires published ${channel} state`);
  }
  if (!record.providerId) {
    throw new Error(`Backfill requires a published provider ID for ${channel}`);
  }
  return record;
}

async function atomicText(path: string, contents: string): Promise<void> {
  const temporary = `${path}.${process.pid}.${randomUUID()}.tmp`;
  await writeFile(temporary, contents, { encoding: "utf8", mode: 0o600 });
  await rename(temporary, path);
}

function recognitionCopy(
  state: CampaignState,
  channel: ThumbnailBackfillChannel,
): string {
  if (channel === "youtube") {
    return `${state.plan.copy.channels.youtube.title}\n\n${state.plan.copy.channels.youtube.description}`;
  }
  return state.plan.copy.channels[channel].caption;
}

function reviewHtml(
  state: CampaignState,
  thumbnailPath: string,
  thumbnail: BackfillThumbnail,
): string {
  const rows = channels
    .map((channel) => {
      const record = state.channels[channel];
      return `<article><h2>${escapeXml(channel)}</h2><p>Buffer: ${escapeXml(record.providerId ?? "ausente")}</p><pre>${escapeXml(recognitionCopy(state, channel))}</pre></article>`;
    })
    .join("\n");
  return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Backfill ${escapeXml(state.plan.id)}</title><style>body{margin:40px auto;max-width:1080px;font:16px/1.5 system-ui;color:#213130}img{display:block;width:min(540px,100%)}article{border-top:1px solid #ccc;padding:20px 0}pre{white-space:pre-wrap}</style></head><body><h1>ALTERE SOMENTE A CAPA</h1><p>${escapeXml(state.plan.id)} · ${escapeXml(thumbnail.hash)}</p><img src="${escapeXml(thumbnailPath)}" alt="Capa vertical"><p>Não altere vídeo, legenda, áudio, público ou visibilidade.</p>${rows}</body></html>`;
}

export async function preparePublishedThumbnail({
  state,
  campaignId,
  brandRoot,
  outputRoot,
}: Readonly<{
  state: CampaignState;
  campaignId: string;
  brandRoot: URL;
  outputRoot: string;
}>) {
  const eligible = channels.filter(
    (channel) => state.channels[channel].stage === "published",
  );
  if (state.plan.id !== campaignId || eligible.length === 0) {
    throw new Error("Backfill requires one exact published campaign");
  }
  for (const channel of eligible) {
    requirePublishedBackfillChannel(state, campaignId, channel);
  }
  const campaignRoot = resolve(outputRoot, campaignId);
  await mkdir(campaignRoot, { recursive: true });
  const brand = await loadBrand(brandRoot);
  const rendered = await renderVideoThumbnail({
    svg: createVerticalThumbnailSvg({ plan: state.plan, brand }),
    output: campaignRoot,
  });
  const bytes = await readFile(rendered.file);
  if (bytes.length > MAXIMUM_YOUTUBE_THUMBNAIL_BYTES) {
    throw new Error("Historical thumbnail exceeds YouTube's 2 MB API limit");
  }
  const thumbnail: BackfillThumbnail = {
    hash: rendered.hash,
    width: rendered.width,
    height: rendered.height,
    format: rendered.format,
  };
  const reviewJson = join(campaignRoot, "review.json");
  const reviewHtmlPath = join(campaignRoot, "index.html");
  const relativeThumbnail = relative(campaignRoot, rendered.file).replaceAll(
    "\\",
    "/",
  );
  const review = {
    schemaVersion: 1,
    campaignId,
    localDate: state.plan.localDate,
    thumbnail: { ...thumbnail, path: relativeThumbnail },
    channels: Object.fromEntries(
      eligible.map((channel) => [
        channel,
        {
          account:
            channel === "instagram"
              ? "https://www.instagram.com/trocohq"
              : channel === "facebook"
                ? "https://www.facebook.com/trocohq"
                : "https://www.youtube.com/@trocohq",
          bufferProviderId: state.channels[channel].providerId,
          recognitionCopy: recognitionCopy(state, channel),
        },
      ]),
    ),
  };
  await Promise.all([
    atomicText(reviewJson, `${JSON.stringify(review, null, 2)}\n`),
    atomicText(reviewHtmlPath, reviewHtml(state, relativeThumbnail, thumbnail)),
  ]);
  return Object.freeze({
    campaignId,
    thumbnail: Object.freeze({ ...thumbnail, file: rendered.file }),
    reviewJson,
    reviewHtml: reviewHtmlPath,
  });
}
```

- [ ] **Step 4: Run focused tests and verify GREEN**

Run the Task 1 command.

Expected: all backfill tests pass and the generated JPEG remains below 2 MB.

- [ ] **Step 5: Commit historical preparation**

```bash
git add src/backfill/prepare.ts tests/thumbnail-backfill.test.ts
git commit -m "feat: prepare historical video covers"
```

### Task 3: Add the authenticated YouTube thumbnail adapter

**Files:**

- Create: `src/networks/youtube/thumbnail.ts`
- Create: `tests/youtube-thumbnail.test.ts`

- [ ] **Step 1: Write failing provider tests**

Create `tests/youtube-thumbnail.test.ts`:

```ts
import assert from "node:assert/strict";
import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { setYouTubeThumbnail } from "../src/networks/youtube/thumbnail.js";

test("YouTube uploads and verifies one authenticated custom thumbnail", async () => {
  const root = await mkdtemp(join(tmpdir(), "troco-youtube-thumbnail-"));
  const filePath = join(root, "thumbnail.jpg");
  const bytes = Buffer.from([0xff, 0xd8, 0xff, 0xd9]);
  await writeFile(filePath, bytes);
  const requests: { url: string; init?: RequestInit }[] = [];
  const fetchImplementation: typeof fetch = async (input, init) => {
    const url = String(input);
    requests.push({ url, init });
    if (init?.method === "POST") {
      return new Response(
        JSON.stringify({
          items: [{ default: { url: "https://i.ytimg.com/1.jpg" } }],
        }),
        {
          status: 200,
          headers: { "content-type": "application/json" },
        },
      );
    }
    return new Response(
      JSON.stringify({
        items: [
          {
            id: "video_1",
            snippet: {
              thumbnails: { default: { url: "https://i.ytimg.com/1.jpg" } },
            },
          },
        ],
      }),
      { status: 200, headers: { "content-type": "application/json" } },
    );
  };

  const result = await setYouTubeThumbnail({
    accessToken: "access-token",
    videoId: "video_1",
    filePath,
    fetchImplementation,
  });

  assert.deepEqual(result, {
    videoId: "video_1",
    permalink: "https://www.youtube.com/watch?v=video_1",
  });
  assert.equal(requests.length, 2);
  assert.match(requests[0]!.url, /thumbnails\/set\?videoId=video_1/u);
  assert.equal(requests[0]!.init?.method, "POST");
  assert.deepEqual(Buffer.from(requests[0]!.init?.body as Uint8Array), bytes);
  for (const request of requests) {
    assert.equal(
      new Headers(request.init?.headers).get("authorization"),
      "Bearer access-token",
    );
  }
});

test("YouTube rejects a thumbnail over the API limit before network access", async () => {
  const root = await mkdtemp(join(tmpdir(), "troco-youtube-thumbnail-"));
  const filePath = join(root, "thumbnail.jpg");
  await writeFile(filePath, Buffer.alloc(2_000_001));
  await assert.rejects(
    setYouTubeThumbnail({
      accessToken: "access-token",
      videoId: "video_1",
      filePath,
      fetchImplementation: async () => {
        throw new Error("network must not run");
      },
    }),
    /2 MB/u,
  );
});

test("YouTube thumbnail failures retain sanitized retry metadata", async () => {
  const root = await mkdtemp(join(tmpdir(), "troco-youtube-thumbnail-"));
  const filePath = join(root, "thumbnail.jpg");
  await writeFile(filePath, Buffer.from([1]));
  await assert.rejects(
    setYouTubeThumbnail({
      accessToken: "access-token",
      videoId: "video_1",
      filePath,
      fetchImplementation: async () => new Response(null, { status: 503 }),
    }),
    (error: unknown) => {
      const record = error as Record<string, unknown>;
      return (
        record.category === "youtube_thumbnail_server" &&
        record.retryable === true
      );
    },
  );
});
```

- [ ] **Step 2: Run the focused test and verify RED**

Run:

```bash
PATH=/Users/guilherme/.nvm/versions/node/v24.14.1/bin:/opt/homebrew/bin:/usr/bin:/bin node --import tsx --test tests/youtube-thumbnail.test.ts
```

Expected: FAIL because the adapter does not exist.

- [ ] **Step 3: Implement the provider adapter**

Create `src/networks/youtube/thumbnail.ts`:

```ts
import { readFile } from "node:fs/promises";

const MAXIMUM_BYTES = 2_000_000;

function providerFailure(status: number): Error {
  const retryable = status === 429 || status >= 500;
  return Object.assign(
    new Error(
      retryable
        ? "YouTube thumbnail update failed temporarily"
        : "YouTube rejected the thumbnail update",
    ),
    {
      category:
        status === 401 || status === 403
          ? "youtube_thumbnail_auth"
          : retryable
            ? "youtube_thumbnail_server"
            : "youtube_thumbnail_validation",
      statusCode: status,
      retryable,
    },
  );
}

async function request(
  url: URL,
  accessToken: string,
  fetchImplementation: typeof fetch,
  init: RequestInit,
): Promise<Response> {
  try {
    return await fetchImplementation(url, {
      ...init,
      headers: {
        ...Object.fromEntries(new Headers(init.headers).entries()),
        authorization: `Bearer ${accessToken}`,
      },
      redirect: "error",
      signal: AbortSignal.timeout(30_000),
    });
  } catch {
    throw Object.assign(
      new Error("YouTube thumbnail request was interrupted"),
      {
        category: "youtube_thumbnail_network",
        retryable: true,
      },
    );
  }
}

export async function setYouTubeThumbnail({
  accessToken,
  videoId,
  filePath,
  fetchImplementation = fetch,
}: Readonly<{
  accessToken: string;
  videoId: string;
  filePath: string;
  fetchImplementation?: typeof fetch;
}>): Promise<Readonly<{ videoId: string; permalink: string }>> {
  if (!accessToken || !videoId) {
    throw new Error(
      "YouTube thumbnail authorization and video ID are required",
    );
  }
  const bytes = await readFile(filePath);
  if (bytes.length === 0 || bytes.length > MAXIMUM_BYTES) {
    throw new Error("YouTube thumbnail must contain 1 byte through 2 MB");
  }
  const uploadUrl = new URL(
    "/upload/youtube/v3/thumbnails/set",
    "https://www.googleapis.com",
  );
  uploadUrl.searchParams.set("videoId", videoId);
  const upload = await request(uploadUrl, accessToken, fetchImplementation, {
    method: "POST",
    headers: {
      "content-type": "image/jpeg",
      "content-length": String(bytes.length),
    },
    body: bytes,
  });
  if (!upload.ok) throw providerFailure(upload.status);
  const uploaded = (await upload.json()) as { items?: readonly unknown[] };
  if (!uploaded.items?.length) {
    throw new Error("YouTube returned no thumbnail resource");
  }

  const verifyUrl = new URL("/youtube/v3/videos", "https://www.googleapis.com");
  verifyUrl.searchParams.set("part", "snippet");
  verifyUrl.searchParams.set("id", videoId);
  const verify = await request(verifyUrl, accessToken, fetchImplementation, {
    method: "GET",
  });
  if (!verify.ok) throw providerFailure(verify.status);
  const payload = (await verify.json()) as {
    items?: readonly {
      id?: string;
      snippet?: { thumbnails?: Readonly<Record<string, unknown>> };
    }[];
  };
  const video = payload.items?.find((item) => item.id === videoId);
  if (!video || !Object.keys(video.snippet?.thumbnails ?? {}).length) {
    throw new Error("YouTube did not verify the custom thumbnail metadata");
  }
  return Object.freeze({
    videoId,
    permalink: `https://www.youtube.com/watch?v=${encodeURIComponent(videoId)}`,
  });
}
```

- [ ] **Step 4: Run YouTube tests and verify GREEN**

Run:

```bash
PATH=/Users/guilherme/.nvm/versions/node/v24.14.1/bin:/opt/homebrew/bin:/usr/bin:/bin node --import tsx --test tests/youtube-thumbnail.test.ts tests/youtube.test.ts
```

Expected: all YouTube tests pass and no live request occurs.

- [ ] **Step 5: Commit the adapter**

```bash
git add src/networks/youtube/thumbnail.ts tests/youtube-thumbnail.test.ts
git commit -m "feat: update YouTube video thumbnails"
```

### Task 4: Orchestrate idempotent provider and native outcomes

**Files:**

- Create: `src/backfill/service.ts`
- Modify: `tests/thumbnail-backfill.test.ts`

- [ ] **Step 1: Add failing idempotency and sibling-isolation tests**

Append tests that inject provider functions rather than accessing the network:

```ts
import {
  executeYouTubeThumbnailBackfill,
  recordNativeThumbnailBackfill,
} from "../src/backfill/service.js";

test("YouTube execution resolves one public video and skips an existing success", async () => {
  const root = await mkdtemp(join(tmpdir(), "troco-thumbnail-service-"));
  const audit = createThumbnailBackfillAudit({
    campaignId,
    thumbnail,
    bufferProviderIds: { youtube: "buffer_yt" },
  });
  let writes = 0;
  const first = await executeYouTubeThumbnailBackfill({
    stateRoot: root,
    audit,
    thumbnailFile: "/tmp/thumbnail.jpg",
    accessToken: "access-token",
    now: new Date("2026-08-28T18:00:00Z"),
    resolveVideo: async () => ({
      id: "youtube_1",
      status: { uploadStatus: "processed", privacyStatus: "public" },
    }),
    setThumbnail: async () => {
      writes += 1;
      return {
        videoId: "youtube_1",
        permalink: "https://www.youtube.com/watch?v=youtube_1",
      };
    },
  });
  assert.equal(first.action, "updated");
  const second = await executeYouTubeThumbnailBackfill({
    stateRoot: root,
    audit,
    thumbnailFile: "/tmp/thumbnail.jpg",
    accessToken: "access-token",
    now: new Date("2026-08-28T18:05:00Z"),
    resolveVideo: async () => {
      throw new Error("resolver must not run");
    },
    setThumbnail: async () => {
      throw new Error("provider must not run");
    },
  });
  assert.equal(second.action, "skipped");
  assert.equal(writes, 1);
});

test("a native Meta result updates one sibling only after preparation", async () => {
  const root = await mkdtemp(join(tmpdir(), "troco-thumbnail-service-"));
  const audit = createThumbnailBackfillAudit({
    campaignId,
    thumbnail,
    bufferProviderIds: { instagram: "buffer_ig", facebook: "buffer_fb" },
  });
  const result = await recordNativeThumbnailBackfill({
    stateRoot: root,
    audit,
    channel: "instagram",
    status: "updated",
    now: new Date("2026-08-28T18:00:00Z"),
  });
  assert.equal(result.channels.instagram.status, "updated");
  assert.equal(result.channels.facebook.status, "pending");
});
```

- [ ] **Step 2: Run the test and verify RED**

Run the Task 1 command.

Expected: FAIL because `service.ts` does not exist.

- [ ] **Step 3: Implement the service boundary**

Create `src/backfill/service.ts`. It must expose the two functions used above
and follow this exact flow:

```ts
import { sanitizeError } from "../state/sanitize.js";
import type { YouTubeVideo } from "../networks/youtube/reconcile.js";
import {
  assertMatchingThumbnail,
  recordThumbnailBackfillOutcome,
  type ThumbnailBackfillAudit,
} from "./schema.js";
import { readThumbnailBackfill, writeThumbnailBackfill } from "./storage.js";

type ResolveVideo = () => Promise<YouTubeVideo | undefined>;
type SetThumbnail = (
  input: Readonly<{
    accessToken: string;
    videoId: string;
    filePath: string;
  }>,
) => Promise<Readonly<{ videoId: string; permalink: string }>>;

async function currentAudit(
  stateRoot: string,
  candidate: ThumbnailBackfillAudit,
): Promise<ThumbnailBackfillAudit> {
  const stored = await readThumbnailBackfill(stateRoot, candidate.campaignId);
  if (!stored) return candidate;
  assertMatchingThumbnail(stored, candidate.thumbnail);
  return stored;
}

export async function executeYouTubeThumbnailBackfill({
  stateRoot,
  audit,
  thumbnailFile,
  accessToken,
  now,
  resolveVideo,
  setThumbnail,
}: Readonly<{
  stateRoot: string;
  audit: ThumbnailBackfillAudit;
  thumbnailFile: string;
  accessToken: string;
  now: Date;
  resolveVideo: ResolveVideo;
  setThumbnail: SetThumbnail;
}>): Promise<
  Readonly<{
    action: "updated" | "skipped" | "not_found";
    audit: ThumbnailBackfillAudit;
  }>
> {
  let current = await currentAudit(stateRoot, audit);
  if (current.channels.youtube.status === "updated") {
    return { action: "skipped", audit: current };
  }
  try {
    const video = await resolveVideo();
    if (!video) {
      current = recordThumbnailBackfillOutcome({
        audit: current,
        channel: "youtube",
        outcome: { status: "not_found" },
        now,
      });
      await writeThumbnailBackfill(stateRoot, current);
      return { action: "not_found", audit: current };
    }
    if (video.status?.privacyStatus !== "public") {
      throw Object.assign(
        new Error("YouTube backfill requires a public Short"),
        {
          category: "youtube_thumbnail_visibility",
        },
      );
    }
    const provider = await setThumbnail({
      accessToken,
      videoId: video.id,
      filePath: thumbnailFile,
    });
    current = recordThumbnailBackfillOutcome({
      audit: current,
      channel: "youtube",
      outcome: {
        status: "updated",
        nativeProviderId: provider.videoId,
        permalink: provider.permalink,
      },
      now,
    });
    await writeThumbnailBackfill(stateRoot, current);
    return { action: "updated", audit: current };
  } catch (error) {
    current = recordThumbnailBackfillOutcome({
      audit: current,
      channel: "youtube",
      outcome: { status: "failed", lastError: sanitizeError(error) },
      now,
    });
    await writeThumbnailBackfill(stateRoot, current);
    throw error;
  }
}

export async function recordNativeThumbnailBackfill({
  stateRoot,
  audit,
  channel,
  status,
  now,
}: Readonly<{
  stateRoot: string;
  audit: ThumbnailBackfillAudit;
  channel: "instagram" | "facebook";
  status: "updated" | "unsupported" | "not_found" | "failed";
  now: Date;
}>): Promise<ThumbnailBackfillAudit> {
  const current = await currentAudit(stateRoot, audit);
  const outcome =
    status === "failed"
      ? {
          status,
          lastError: sanitizeError(
            Object.assign(
              new Error("Native cover update failed during controlled review"),
              {
                category: "native_thumbnail_update",
              },
            ),
          ),
        }
      : { status };
  const next = recordThumbnailBackfillOutcome({
    audit: current,
    channel,
    outcome,
    now,
  });
  await writeThumbnailBackfill(stateRoot, next);
  return next;
}
```

- [ ] **Step 4: Run focused tests and verify GREEN**

Run the Task 1 command.

Expected: all backfill tests pass, one provider write occurs, and sibling state
remains unchanged.

- [ ] **Step 5: Commit orchestration**

```bash
git add src/backfill/service.ts tests/thumbnail-backfill.test.ts
git commit -m "feat: orchestrate thumbnail backfills"
```

### Task 5: Add the guarded CLI

**Files:**

- Create: `src/cli/backfill-thumbnails.ts`
- Create: `tests/backfill-cli.test.ts`
- Modify: `package.json`

- [ ] **Step 1: Write failing argument-gate tests**

Create `tests/backfill-cli.test.ts`:

```ts
import assert from "node:assert/strict";
import test from "node:test";

import { parseBackfillArguments } from "../src/cli/backfill-thumbnails.js";

const campaignId = "2026-08-27-quick-calculation-v1-0";

test("backfill preparation is the default and requires one exact campaign", () => {
  assert.deepEqual(
    parseBackfillArguments([
      "--campaign",
      campaignId,
      "--brand-root",
      "../frontend/public",
    ]),
    {
      mode: "prepare",
      campaignId,
      brandRoot: "../frontend/public",
      stateRoot: "state",
      outputRoot: ".tmp/thumbnail-backfill",
    },
  );
  assert.throws(
    () => parseBackfillArguments(["--campaign", "2026-08-27"]),
    /exact campaign/i,
  );
});

test("YouTube execution requires channel, execute, and matching confirmation", () => {
  assert.equal(
    parseBackfillArguments([
      "--campaign",
      campaignId,
      "--brand-root",
      "../frontend/public",
      "--channel",
      "youtube",
      "--execute",
      "--confirm",
      campaignId,
    ]).mode,
    "youtube",
  );
  assert.throws(
    () =>
      parseBackfillArguments([
        "--campaign",
        campaignId,
        "--brand-root",
        "../frontend/public",
        "--channel",
        "youtube",
        "--execute",
      ]),
    /confirmation/i,
  );
});

test("native outcomes reject YouTube and unsupported values", () => {
  assert.equal(
    parseBackfillArguments([
      "--campaign",
      campaignId,
      "--brand-root",
      "../frontend/public",
      "--channel",
      "instagram",
      "--record",
      "updated",
      "--confirm",
      campaignId,
    ]).mode,
    "record",
  );
  assert.throws(
    () =>
      parseBackfillArguments([
        "--campaign",
        campaignId,
        "--brand-root",
        "../frontend/public",
        "--channel",
        "youtube",
        "--record",
        "updated",
        "--confirm",
        campaignId,
      ]),
    /native Meta/i,
  );
});
```

- [ ] **Step 2: Run the CLI test and verify RED**

Run:

```bash
PATH=/Users/guilherme/.nvm/versions/node/v24.14.1/bin:/opt/homebrew/bin:/usr/bin:/bin node --import tsx --test tests/backfill-cli.test.ts
```

Expected: FAIL because the CLI module does not exist.

- [ ] **Step 3: Implement parsing and controlled execution**

Create `src/cli/backfill-thumbnails.ts` with exported
`parseBackfillArguments(args)`. Implement the parser with these exact request
types and gates:

```ts
type BackfillBase = Readonly<{
  campaignId: string;
  brandRoot: string;
  stateRoot: string;
  outputRoot: string;
}>;

export type BackfillRequest =
  | (BackfillBase & Readonly<{ mode: "prepare" }>)
  | (BackfillBase & Readonly<{ mode: "youtube"; channel: "youtube" }>)
  | (BackfillBase &
      Readonly<{
        mode: "record";
        channel: "instagram" | "facebook";
        status: "updated" | "unsupported" | "not_found" | "failed";
      }>);

const campaignPattern = /^\d{4}-\d{2}-\d{2}-[a-z0-9-]+-v\d+-\d+$/;
const valueFlags = new Set([
  "--campaign",
  "--brand-root",
  "--state-root",
  "--output",
  "--channel",
  "--record",
  "--confirm",
]);

export function parseBackfillArguments(
  args: readonly string[],
): BackfillRequest {
  const values = new Map<string, string>();
  let execute = false;
  for (let index = 0; index < args.length;) {
    const flag = args[index];
    if (flag === "--execute") {
      if (execute) throw new Error("Duplicate argument: --execute");
      execute = true;
      index += 1;
      continue;
    }
    if (!flag || !valueFlags.has(flag)) {
      throw new Error(`Unknown argument: ${flag ?? "<missing>"}`);
    }
    const value = args[index + 1];
    if (!value || value.startsWith("--")) {
      throw new Error(`Missing value for ${flag}`);
    }
    if (values.has(flag)) throw new Error(`Duplicate argument: ${flag}`);
    values.set(flag, value);
    index += 2;
  }

  const campaignId = values.get("--campaign") ?? "";
  const brandRoot = values.get("--brand-root") ?? "";
  if (!campaignPattern.test(campaignId)) {
    throw new Error("One exact campaign ID is required");
  }
  if (!brandRoot) throw new Error("--brand-root is required");
  const base = {
    campaignId,
    brandRoot,
    stateRoot: values.get("--state-root") ?? "state",
    outputRoot: values.get("--output") ?? ".tmp/thumbnail-backfill",
  } as const;
  const channel = values.get("--channel");
  const record = values.get("--record");
  const confirmation = values.get("--confirm");

  if (execute && record) {
    throw new Error("Backfill cannot execute and record simultaneously");
  }
  if (execute) {
    if (channel !== "youtube" || confirmation !== campaignId) {
      throw new Error("Exact YouTube backfill confirmation is required");
    }
    return { ...base, mode: "youtube", channel: "youtube" };
  }
  if (record) {
    if (channel !== "instagram" && channel !== "facebook") {
      throw new Error("Only a native Meta outcome may be recorded");
    }
    if (
      !new Set(["updated", "unsupported", "not_found", "failed"]).has(record)
    ) {
      throw new Error("Invalid native thumbnail outcome");
    }
    if (confirmation !== campaignId) {
      throw new Error("Exact native backfill confirmation is required");
    }
    return {
      ...base,
      mode: "record",
      channel,
      status: record as "updated" | "unsupported" | "not_found" | "failed",
    };
  }
  if (channel || confirmation) {
    throw new Error("Prepare mode does not accept channel or confirmation");
  }
  return { ...base, mode: "prepare" };
}
```

The parser therefore:

- accept value flags `--campaign`, `--brand-root`, `--state-root`, `--output`,
  `--channel`, `--record`, and `--confirm` exactly once;
- accept boolean `--execute` exactly once;
- reject every unknown, duplicate, or missing flag value;
- validate the complete campaign ID regex;
- return `prepare` when neither `--execute` nor `--record` is present;
- return `youtube` only for `--channel youtube --execute --confirm <campaign>`;
- return `record` only for Instagram or Facebook with one of `updated`,
  `unsupported`, `not_found`, or `failed` and matching confirmation;
- reject simultaneous execution and recording.

Import the backfill, campaign-state, OAuth, reconciliation, thumbnail-provider,
sanitization, path, and URL helpers used below. Implement the module's `run`
function with these exact operations:

```ts
const state = await readCampaignState(
  resolve(request.stateRoot),
  request.campaignId.slice(0, 10),
);
if (state.plan.id !== request.campaignId) {
  throw new Error("Backfill campaign does not match state");
}
const prepared = await preparePublishedThumbnail({
  state,
  campaignId: request.campaignId,
  brandRoot: directoryUrl(resolve(request.brandRoot)),
  outputRoot: resolve(request.outputRoot),
});
const thumbnail = {
  hash: prepared.thumbnail.hash,
  width: prepared.thumbnail.width,
  height: prepared.thumbnail.height,
  format: prepared.thumbnail.format,
} as const;
const audit = createThumbnailBackfillAudit({
  campaignId: request.campaignId,
  thumbnail,
  bufferProviderIds: {
    ...(state.channels.instagram.providerId
      ? { instagram: state.channels.instagram.providerId }
      : {}),
    ...(state.channels.facebook.providerId
      ? { facebook: state.channels.facebook.providerId }
      : {}),
    ...(state.channels.youtube.providerId
      ? { youtube: state.channels.youtube.providerId }
      : {}),
  },
});
```

Complete the three branches as follows:

```ts
if (request.mode === "prepare") {
  process.stdout.write(
    `${JSON.stringify({
      ok: true,
      mode: request.mode,
      campaignId: request.campaignId,
      thumbnail: {
        path: prepared.thumbnail.file,
        hash: prepared.thumbnail.hash,
      },
      review: prepared.reviewHtml,
    })}\n`,
  );
  return;
}

if (request.mode === "record") {
  requirePublishedBackfillChannel(state, request.campaignId, request.channel);
  const result = await recordNativeThumbnailBackfill({
    stateRoot: resolve(request.stateRoot),
    audit,
    channel: request.channel,
    status: request.status,
    now,
  });
  process.stdout.write(
    `${JSON.stringify({
      ok: true,
      mode: request.mode,
      campaignId: request.campaignId,
      channel: request.channel,
      status: result.channels[request.channel].status,
    })}\n`,
  );
  return;
}

requirePublishedBackfillChannel(state, request.campaignId, "youtube");
const clientId = environment.YOUTUBE_CLIENT_ID ?? "";
const clientSecret = environment.YOUTUBE_CLIENT_SECRET ?? "";
const refreshToken = environment.YOUTUBE_REFRESH_TOKEN ?? "";
if (!clientId || !clientSecret || !refreshToken) {
  throw new Error("YouTube thumbnail OAuth credentials are incomplete");
}
const tokenProvider = createYouTubeAccessTokenProvider({
  clientId,
  clientSecret,
  refreshToken,
});
const accessToken = await tokenProvider.getAccessToken(now);
const result = await executeYouTubeThumbnailBackfill({
  stateRoot: resolve(request.stateRoot),
  audit,
  thumbnailFile: prepared.thumbnail.file,
  accessToken,
  now,
  resolveVideo: () =>
    reconcileYouTubeUpload({
      campaignId: request.campaignId,
      accessToken,
    }),
  setThumbnail: ({ accessToken, videoId, filePath }) =>
    setYouTubeThumbnail({ accessToken, videoId, filePath }),
});
process.stdout.write(
  `${JSON.stringify({
    ok: true,
    mode: request.mode,
    campaignId: request.campaignId,
    channel: "youtube",
    action: result.action,
    status: result.audit.channels.youtube.status,
  })}\n`,
);
```

Define `run(request, environment = process.env, now = new Date())` so tests can
inject time and an environment. Add the standard direct-invocation guard used by
the other CLIs. Its catch must call `sanitizeError(error)`, print only
`{ ok: false, error: sanitized }`, and set exit code 1. It must never print
`process.env`, a token, a raw response, or a request URL containing credentials.

- [ ] **Step 4: Add the package script**

Add to `package.json` beside the other controlled commands:

```json
"backfill-thumbnails": "node --import tsx src/cli/backfill-thumbnails.ts"
```

- [ ] **Step 5: Run CLI, type, and package tests**

Run:

```bash
PATH=/Users/guilherme/.nvm/versions/node/v24.14.1/bin:/opt/homebrew/bin:/usr/bin:/bin node --import tsx --test tests/backfill-cli.test.ts tests/thumbnail-backfill.test.ts tests/youtube-thumbnail.test.ts
PATH=/Users/guilherme/.nvm/versions/node/v24.14.1/bin:/opt/homebrew/bin:/usr/bin:/bin npm run typecheck
```

Expected: all focused tests and strict TypeScript pass.

- [ ] **Step 6: Commit the CLI**

```bash
git add src/cli/backfill-thumbnails.ts tests/backfill-cli.test.ts package.json
git commit -m "feat: add controlled thumbnail backfill CLI"
```

### Task 6: Document the maintenance operation

**Files:**

- Modify: `README.md`
- Modify: `docs/operations.md`
- Modify: `tests/package-contract.test.ts`

- [ ] **Step 1: Add a failing documentation contract**

Append to `tests/package-contract.test.ts`:

```ts
test("operations document immutable published thumbnail backfills", async () => {
  const readme = await readFile(
    new URL("../README.md", import.meta.url),
    "utf8",
  );
  const operations = await readFile(
    new URL("../docs/operations.md", import.meta.url),
    "utf8",
  );
  assert.match(readme, /backfill-thumbnails/u);
  assert.match(readme, /does not replace the published video/u);
  assert.match(operations, /exact campaign ID/u);
  assert.match(operations, /ALTERE SOMENTE A CAPA/u);
  assert.match(operations, /thumbnails\.set/u);
  assert.match(operations, /never delete or republish/u);
});
```

- [ ] **Step 2: Run the package test and verify RED**

Run:

```bash
PATH=/Users/guilherme/.nvm/versions/node/v24.14.1/bin:/opt/homebrew/bin:/usr/bin:/bin node --import tsx --test tests/package-contract.test.ts
```

Expected: FAIL because the maintenance command is not documented.

- [ ] **Step 3: Add the README summary**

Document that `npm run backfill-thumbnails -- --campaign ID --brand-root PATH`
creates a local review only, does not replace the published video, and requires
separate exact execute/record confirmations. Link to the operations runbook.

- [ ] **Step 4: Add the operations runbook**

Add a `Published thumbnail backfill` section with the exact sequence:

```bash
npm run backfill-thumbnails -- --campaign CAMPAIGN_ID --brand-root ../frontend/public
npm run backfill-thumbnails -- --campaign CAMPAIGN_ID --brand-root ../frontend/public --channel youtube --execute --confirm CAMPAIGN_ID
npm run backfill-thumbnails -- --campaign CAMPAIGN_ID --brand-root ../frontend/public --channel instagram --record updated --confirm CAMPAIGN_ID
npm run backfill-thumbnails -- --campaign CAMPAIGN_ID --brand-root ../frontend/public --channel facebook --record updated --confirm CAMPAIGN_ID
```

Explain credential injection, local review, `ALTERE SOMENTE A CAPA`, provider
identity checks, audit status meanings, idempotent reruns, and the rule to never
delete or republish a post as fallback.

- [ ] **Step 5: Run the package and focused tests**

Run:

```bash
PATH=/Users/guilherme/.nvm/versions/node/v24.14.1/bin:/opt/homebrew/bin:/usr/bin:/bin node --import tsx --test tests/package-contract.test.ts tests/backfill-cli.test.ts tests/thumbnail-backfill.test.ts tests/youtube-thumbnail.test.ts
```

Expected: all documentation and backfill tests pass.

- [ ] **Step 6: Commit documentation**

```bash
git add README.md docs/operations.md tests/package-contract.test.ts
git commit -m "docs: explain published thumbnail backfills"
```

### Task 7: Complete code and artifact verification

**Files:**

- Verify only; no tracked source change is expected.

- [ ] **Step 1: Format and run the complete quality gate**

Run:

```bash
PATH=/Users/guilherme/.nvm/versions/node/v24.14.1/bin:/opt/homebrew/bin:/usr/bin:/bin npm run format
PATH=/Users/guilherme/.nvm/versions/node/v24.14.1/bin:/opt/homebrew/bin:/usr/bin:/bin npm run check
PATH=/Users/guilherme/.nvm/versions/node/v24.14.1/bin:/opt/homebrew/bin:/usr/bin:/bin npm run validate
```

Expected: Prettier leaves tracked files formatted, TypeScript passes, every test
passes with zero failures, and validation emits `"ok":true`.

- [ ] **Step 2: Generate both historical review bundles without provider writes**

Run the prepare command once for each exact ID:

```bash
PATH=/Users/guilherme/.nvm/versions/node/v24.14.1/bin:/opt/homebrew/bin:/usr/bin:/bin npm run backfill-thumbnails -- --campaign 2026-08-27-quick-calculation-v1-0 --brand-root ../frontend/public
PATH=/Users/guilherme/.nvm/versions/node/v24.14.1/bin:/opt/homebrew/bin:/usr/bin:/bin npm run backfill-thumbnails -- --campaign 2026-08-28-safe-checkout-v1-4 --brand-root ../frontend/public
```

Expected: both commands report `mode: "prepare"`; no file appears under
`state/thumbnail-backfills/`.

- [ ] **Step 3: Inspect both covers and reviews**

Open both generated `index.html` files and confirm:

- the campaign ID and recognition copy match the published post;
- the Troco mark, family pill, challenge, and CTA are correct;
- the answer is not revealed;
- the centered block and 40-pixel gaps match the approved cover;
- the JPEG is 1080×1920 sRGB and below 2 MB;
- the review says `ALTERE SOMENTE A CAPA`.

- [ ] **Step 4: Confirm repository hygiene before external writes**

Run:

```bash
git diff --check
git status --short --branch
git log --oneline origin/main..HEAD
```

Expected: no tracked changes remain; `.DS_Store` and `.superpowers/` remain
untracked; `main` is ahead of `origin/main`; no push occurs.

### Task 8: Apply the six published cover changes

**Files:**

- Write: `state/thumbnail-backfills/2026-08-27-quick-calculation-v1-0.json`
- Write: `state/thumbnail-backfills/2026-08-28-safe-checkout-v1-4.json`

- [ ] **Step 1: Confirm YouTube credentials without printing values**

Verify that the execution environment contains all three names:

```bash
env | cut -d= -f1 | rg '^YOUTUBE_(CLIENT_ID|CLIENT_SECRET|REFRESH_TOKEN)$'
```

Expected: exactly three variable names. If any are absent, stop YouTube API
execution and request credential availability; never read or print a secret.

- [ ] **Step 2: Execute the 27 August YouTube update**

Run:

```bash
PATH=/Users/guilherme/.nvm/versions/node/v24.14.1/bin:/opt/homebrew/bin:/usr/bin:/bin npm run backfill-thumbnails -- --campaign 2026-08-27-quick-calculation-v1-0 --brand-root ../frontend/public --channel youtube --execute --confirm 2026-08-27-quick-calculation-v1-0
```

Expected: one exact public Short is resolved and the audit reports YouTube
`updated` with a native video ID and permalink.

- [ ] **Step 3: Execute the 28 August YouTube update**

Run the same command for `2026-08-28-safe-checkout-v1-4` with its matching
confirmation.

Expected: one exact public Short is updated and audited.

- [ ] **Step 4: Update Instagram natively one post at a time**

Using the authenticated Troco Instagram account:

1. locate the 27 August Reel by date and recognition copy;
2. verify the account is `@trocohq`;
3. open the native cover editor;
4. upload the matching reviewed JPEG;
5. save without changing any other field;
6. reopen the Reel or profile grid and visually verify the new cover;
7. repeat for the 28 August Reel.

If the native interface lacks a cover editor, do not delete or republish; record
`unsupported`. If the post cannot be matched exactly, record `not_found`.

- [ ] **Step 5: Record each observed Instagram result**

After each visual verification, run the exact record command with `updated`,
`unsupported`, `not_found`, or `failed` and the matching campaign confirmation.

Expected: only `channels.instagram` changes in each audit file.

- [ ] **Step 6: Update Facebook natively one post at a time**

Repeat the Instagram procedure on the Troco Facebook Page at
`https://www.facebook.com/trocohq`, using the matching JPEG and recognition copy.
Only change the thumbnail or cover field exposed by the Page or Meta Business
Suite. Do not change the Reel, caption, audience, or publication identity.

- [ ] **Step 7: Record each observed Facebook result**

Run the exact native record command for each campaign only after the visible
Facebook result is known.

Expected: only `channels.facebook` changes in each audit file.

- [ ] **Step 8: Verify all audit records and external identities**

Validate both JSON files through the schema and confirm:

- all successful channels contain `status: "updated"`;
- both YouTube records contain native IDs and public permalinks;
- no audit contains a token, authorization header, cookie, or raw response;
- the original campaign JSON bytes, provider IDs, stages, render hashes,
  captions, and published timestamps remain unchanged;
- all six original posts still exist under the same identities.

- [ ] **Step 9: Commit only sanitized audit state**

```bash
git add state/thumbnail-backfills/2026-08-27-quick-calculation-v1-0.json state/thumbnail-backfills/2026-08-28-safe-checkout-v1-4.json
git commit -m "chore(state): audit published thumbnail backfill [skip ci]"
```

Do not stage generated JPEGs, HTML, `.DS_Store`, `.superpowers/`, environment
files, or credentials. Do not push.

- [ ] **Step 10: Run final verification after the state commit**

Run:

```bash
PATH=/Users/guilherme/.nvm/versions/node/v24.14.1/bin:/opt/homebrew/bin:/usr/bin:/bin npm run check
PATH=/Users/guilherme/.nvm/versions/node/v24.14.1/bin:/opt/homebrew/bin:/usr/bin:/bin npm run validate
git diff --check
git status --short --branch
```

Expected: all tests pass, validation succeeds, no tracked changes remain, the
two ignored/untracked companion items remain untouched, and local `main` stays
ahead with no push.
