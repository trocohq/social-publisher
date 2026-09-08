import { randomUUID } from "node:crypto";
import {
  lstat,
  mkdir,
  readFile,
  realpath,
  rename,
  rm,
  writeFile,
} from "node:fs/promises";
import { basename, dirname, join, relative, resolve, sep } from "node:path";

import { sha256 } from "../shared/determinism.js";
import type { CampaignState } from "../state/schema.js";
import { addCalendarDays } from "../shared/time.js";
import {
  campaignMediaRecordSchema,
  type CampaignMediaRecord,
  type MediaAsset,
} from "./manifest.js";

function assertLocalDate(value: string): void {
  const parsed = new Date(`${value}T12:00:00Z`);
  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(value) ||
    Number.isNaN(parsed.valueOf()) ||
    parsed.toISOString().slice(0, 10) !== value
  ) {
    throw new Error("Invalid Pages local date");
  }
}

export function retainedCampaignIds(
  states: readonly CampaignState[],
  now: Date,
): string[] {
  if (Number.isNaN(now.valueOf())) throw new Error("Invalid retention time");
  const cutoff = now.valueOf() - 2 * 86_400_000;
  return states
    .filter((state) =>
      Object.values(state.channels).some((record) => {
        if (["scheduling", "scheduled", "publishing"].includes(record.stage)) {
          return true;
        }
        const scheduled = new Date(
          record.scheduledAt ?? state.plan.targetAt,
        ).valueOf();
        return (
          scheduled > new Date(state.plan.targetAt).valueOf() &&
          scheduled >= cutoff
        );
      }),
    )
    .map((state) => state.plan.id);
}

export function datesInPagesPayload(today: string): string[] {
  assertLocalDate(today);
  return Array.from({ length: 10 }, (_, index) =>
    addCalendarDays(today, index - 2),
  );
}

function encodedPath(...segments: readonly string[]): string {
  return segments.map((segment) => encodeURIComponent(segment)).join("/");
}

export function publicMediaUrls(
  pagesOrigin: string,
  input: CampaignMediaRecord,
): Readonly<{ feed: readonly string[]; video: string; manifest: string }> {
  const record = campaignMediaRecordSchema.parse(input);
  const base = new URL(
    pagesOrigin.endsWith("/") ? pagesOrigin : `${pagesOrigin}/`,
  );
  if (
    base.protocol !== "https:" ||
    base.username ||
    base.password ||
    base.search ||
    base.hash
  ) {
    throw new Error("Pages origin must be a clean HTTPS URL");
  }
  const campaignBase = encodedPath(
    "media",
    record.localDate,
    record.campaignId,
  );
  const assetUrl = (asset: MediaAsset): string => {
    const url = new URL(
      `${campaignBase}/${encodedPath(asset.kind, asset.filename)}`,
      base,
    );
    if (url.origin !== base.origin || !url.pathname.startsWith(base.pathname)) {
      throw new Error("Public media URL escaped the Pages origin");
    }
    return url.toString();
  };
  const feed = record.assets
    .filter((asset) => asset.kind === "feed")
    .map(assetUrl);
  const videoAsset = record.assets.find((asset) => asset.kind === "video");
  if (!videoAsset) throw new Error("Campaign has no public video");
  const manifest = new URL(`${campaignBase}/manifest.json`, base).toString();
  return Object.freeze({
    feed: Object.freeze(feed),
    video: assetUrl(videoAsset),
    manifest,
  });
}

async function atomicJson(path: string, value: unknown): Promise<void> {
  const temporary = `${path}.${randomUUID()}.tmp`;
  await writeFile(temporary, serializedJson(value), "utf8");
  await rename(temporary, path);
}

function serializedJson(value: unknown): string {
  return `${JSON.stringify(value, null, 2)}\n`;
}

// Conservative project cap below the hosting service's published site limit.
const pagesByteBudget = 500_000_000;

function addPayloadBytes(total: number, bytes: number): number {
  const next = total + bytes;
  if (!Number.isSafeInteger(next) || next > pagesByteBudget) {
    throw new Error("Pages payload exceeds 500000000-byte budget");
  }
  return next;
}

async function sourceSize(root: string, path: string): Promise<number> {
  await requireSafeSource(root, path);
  const metadata = await lstat(path);
  if (
    !metadata.isFile() ||
    !Number.isSafeInteger(metadata.size) ||
    metadata.size <= 0
  ) {
    throw new Error("Source media must be a regular file with positive size");
  }
  if (metadata.size > 50_000_000) {
    throw new Error(`Source media exceeds 50 MB: ${basename(path)}`);
  }
  return metadata.size;
}

function mediaSourcePath(
  root: string,
  campaign: CampaignMediaRecord,
  asset: MediaAsset,
): string {
  return join(
    root,
    campaign.localDate,
    campaign.campaignId,
    asset.kind,
    asset.filename,
  );
}

function assertSafePagesRoot(path: string, renderRoot: string): void {
  if (
    basename(path) !== "pages" ||
    dirname(path) === path ||
    path === resolve(sep)
  ) {
    throw new Error("Pages root must be a dedicated directory named pages");
  }
  if (path === renderRoot || renderRoot.startsWith(`${path}${sep}`)) {
    throw new Error("Pages root cannot contain the render root");
  }
}

async function rejectExistingSymlink(path: string): Promise<void> {
  try {
    if ((await lstat(path)).isSymbolicLink()) {
      throw new Error(`Symlink is not allowed: ${path}`);
    }
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }
}

export async function requireSafeSource(
  root: string,
  path: string,
): Promise<void> {
  const rootRealPath = await realpath(root);
  const pathRelative = relative(root, path);
  if (pathRelative === ".." || pathRelative.startsWith(`..${sep}`)) {
    throw new Error("Media source escaped the render root");
  }
  let cursor = root;
  for (const part of pathRelative.split(sep)) {
    cursor = join(cursor, part);
    const metadata = await lstat(cursor);
    if (metadata.isSymbolicLink())
      throw new Error(`Symlink is not allowed: ${cursor}`);
  }
  const sourceRealPath = await realpath(path);
  const realRelative = relative(rootRealPath, sourceRealPath);
  if (realRelative === ".." || realRelative.startsWith(`..${sep}`)) {
    throw new Error("Media source escaped the render root");
  }
}

export async function createPagesPayload({
  today,
  campaigns,
  renderRoot,
  pagesRoot,
  retainedIds = [],
}: Readonly<{
  today: string;
  campaigns: readonly CampaignMediaRecord[];
  renderRoot: string;
  pagesRoot: string;
  retainedIds?: readonly string[];
}>): Promise<readonly CampaignMediaRecord[]> {
  const sourceRoot = resolve(renderRoot);
  const outputRoot = resolve(pagesRoot);
  assertSafePagesRoot(outputRoot, sourceRoot);
  await rejectExistingSymlink(outputRoot);

  const allowedDates = new Set(datesInPagesPayload(today));
  const selected = campaigns
    .map((campaign) => campaignMediaRecordSchema.parse(campaign))
    .filter(
      (campaign) =>
        allowedDates.has(campaign.localDate) ||
        retainedIds.includes(campaign.campaignId),
    )
    .sort((left, right) => left.localDate.localeCompare(right.localDate));
  const completed: CampaignMediaRecord[] = [];
  let assetBytes = 0;
  for (const campaign of selected) {
    const assets: MediaAsset[] = [];
    for (const asset of campaign.assets) {
      const bytes = await sourceSize(
        sourceRoot,
        mediaSourcePath(sourceRoot, campaign, asset),
      );
      assetBytes = addPayloadBytes(assetBytes, bytes);
      assets.push({ ...asset, bytes });
    }
    completed.push(campaignMediaRecordSchema.parse({ ...campaign, assets }));
  }
  const index = {
    schemaVersion: 1,
    today,
    campaigns: completed.map((campaign) => ({
      localDate: campaign.localDate,
      campaignId: campaign.campaignId,
      manifest: `media/${campaign.localDate}/${campaign.campaignId}/manifest.json`,
    })),
  };
  let metadataBytes = Buffer.byteLength(serializedJson(index));
  for (const campaign of completed) {
    metadataBytes = addPayloadBytes(
      metadataBytes,
      Buffer.byteLength(serializedJson(campaign)),
    );
  }
  addPayloadBytes(assetBytes, metadataBytes);

  await rm(outputRoot, { recursive: true, force: true });
  await mkdir(outputRoot, { recursive: true });
  let copiedBytes = metadataBytes;
  for (const campaign of completed) {
    const destinationRoot = join(
      outputRoot,
      "media",
      campaign.localDate,
      campaign.campaignId,
    );
    for (const asset of campaign.assets) {
      const sourcePath = mediaSourcePath(sourceRoot, campaign, asset);
      const size = await sourceSize(sourceRoot, sourcePath);
      if (size !== asset.bytes)
        throw new Error(`Source media size changed: ${asset.filename}`);
      const bytes = await readFile(sourcePath);
      if (bytes.length > 50_000_000) {
        throw new Error(`Source media exceeds 50 MB: ${asset.filename}`);
      }
      copiedBytes = addPayloadBytes(copiedBytes, bytes.length);
      if (bytes.length !== asset.bytes)
        throw new Error(`Source media size changed: ${asset.filename}`);
      if (sha256(bytes) !== asset.hash) {
        throw new Error(`Source media hash mismatch: ${asset.filename}`);
      }
      const destinationDirectory = join(destinationRoot, asset.kind);
      await mkdir(destinationDirectory, { recursive: true });
      // Persist exactly the bytes checked above, even if the source changes now.
      await writeFile(join(destinationDirectory, asset.filename), bytes);
    }
    await atomicJson(join(destinationRoot, "manifest.json"), campaign);
  }

  await atomicJson(join(outputRoot, "index.json"), index);
  return Object.freeze(completed);
}
