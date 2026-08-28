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
