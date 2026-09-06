import { randomUUID } from "node:crypto";
import {
  copyFile,
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
  await writeFile(temporary, `${JSON.stringify(value, null, 2)}\n`, "utf8");
  await rename(temporary, path);
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
  await rejectExistingSymlink(root);
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
}: Readonly<{
  today: string;
  campaigns: readonly CampaignMediaRecord[];
  renderRoot: string;
  pagesRoot: string;
}>): Promise<readonly CampaignMediaRecord[]> {
  const sourceRoot = resolve(renderRoot);
  const outputRoot = resolve(pagesRoot);
  assertSafePagesRoot(outputRoot, sourceRoot);
  await rejectExistingSymlink(outputRoot);
  await rm(outputRoot, { recursive: true, force: true });
  await mkdir(outputRoot, { recursive: true });

  const allowedDates = new Set(datesInPagesPayload(today));
  const selected = campaigns
    .map((campaign) => campaignMediaRecordSchema.parse(campaign))
    .filter((campaign) => allowedDates.has(campaign.localDate))
    .sort((left, right) => left.localDate.localeCompare(right.localDate));
  const completed: CampaignMediaRecord[] = [];

  for (const campaign of selected) {
    const destinationRoot = join(
      outputRoot,
      "media",
      campaign.localDate,
      campaign.campaignId,
    );
    const copiedAssets: MediaAsset[] = [];
    for (const asset of campaign.assets) {
      const sourcePath = join(
        sourceRoot,
        campaign.localDate,
        campaign.campaignId,
        asset.kind,
        asset.filename,
      );
      await requireSafeSource(sourceRoot, sourcePath);
      const bytes = await readFile(sourcePath);
      if (sha256(bytes) !== asset.hash) {
        throw new Error(`Source media hash mismatch: ${asset.filename}`);
      }
      if (bytes.length > 50_000_000) {
        throw new Error(`Source media exceeds 50 MB: ${asset.filename}`);
      }
      const destinationDirectory = join(destinationRoot, asset.kind);
      await mkdir(destinationDirectory, { recursive: true });
      await copyFile(sourcePath, join(destinationDirectory, asset.filename));
      copiedAssets.push({ ...asset, bytes: bytes.length });
    }
    const completedRecord = campaignMediaRecordSchema.parse({
      ...campaign,
      assets: copiedAssets,
    });
    await atomicJson(join(destinationRoot, "manifest.json"), completedRecord);
    completed.push(completedRecord);
  }

  await atomicJson(join(outputRoot, "index.json"), {
    schemaVersion: 1,
    today,
    campaigns: completed.map((campaign) => ({
      localDate: campaign.localDate,
      campaignId: campaign.campaignId,
      manifest: `media/${campaign.localDate}/${campaign.campaignId}/manifest.json`,
    })),
  });
  return Object.freeze(completed);
}
