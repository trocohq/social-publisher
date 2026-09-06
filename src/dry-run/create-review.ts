import { randomUUID } from "node:crypto";
import { mkdir, rename, writeFile } from "node:fs/promises";
import { join, relative, resolve } from "node:path";

import { loadBrand } from "../brand/load-brand.js";
import { createCampaign } from "../planning/create-campaign.js";
import { renderFeed, type RenderedFeed } from "../render/image.js";
import { escapeXml } from "../render/svg.js";
import { renderVideo, type RenderedVideo } from "../render/video.js";

async function atomicWrite(path: string, contents: string): Promise<void> {
  const temporaryPath = `${path}.${process.pid}.${randomUUID()}.tmp`;
  await writeFile(temporaryPath, contents, { encoding: "utf8", mode: 0o600 });
  await rename(temporaryPath, path);
}

function localAssetPath(root: string, path: string): string {
  return relative(root, path).replaceAll("\\", "/");
}

function soundtrackSourceLink(source: string): string | undefined {
  try {
    const url = new URL(source);
    if (url.protocol !== "https:") return undefined;
    return `<a href="${escapeXml(url.toString())}">fonte</a>`;
  } catch {
    return undefined;
  }
}

function reviewHtml(
  campaignId: string,
  targetAt: string,
  channels: ReturnType<typeof createCampaign>["copy"]["channels"],
  feed: RenderedFeed,
  video: RenderedVideo,
  root: string,
): string {
  const imageMarkup = feed.files
    .map(
      (file, index) => `<figure>
        <img src="${escapeXml(localAssetPath(root, file))}" alt="Slide ${index + 1} da campanha ${escapeXml(campaignId)}">
        <figcaption>Slide ${index + 1} · SHA-256 ${escapeXml(feed.hashes[index] ?? "")}</figcaption>
      </figure>`,
    )
    .join("\n");
  const channelMarkup = [
    ["Instagram", channels.instagram.caption],
    ["Facebook", channels.facebook.caption],
    ["TikTok", `${channels.tiktok.title}\n\n${channels.tiktok.caption}`],
    ["YouTube", `${channels.youtube.title}\n\n${channels.youtube.description}`],
  ]
    .map(
      ([label, copy]) =>
        `<article><h3>${label}</h3><pre>${escapeXml(copy ?? "")}</pre></article>`,
    )
    .join("\n");
  const probe = video.probe;
  const soundtrack = video.soundtrack;
  const sourceLink = soundtrackSourceLink(soundtrack.source);

  return `<!doctype html>
<html lang="pt-BR">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>Troco Social Review · ${escapeXml(campaignId)}</title>
  <style>
    :root{color-scheme:light;--paper:#fefdfb;--ink:#213130;--line:#c9c7be;--accent:#b0ec9c}
    *{box-sizing:border-box}body{margin:0;background:var(--paper);color:var(--ink);font:16px/1.5 system-ui,sans-serif}
    main{width:min(1180px,calc(100% - 40px));margin:48px auto 96px}h1{font-size:clamp(2rem,6vw,4.5rem);line-height:1;margin:.2em 0}
    .meta{padding:16px 20px;border:1px solid var(--line);border-radius:16px}.media{display:grid;grid-template-columns:repeat(auto-fit,minmax(260px,1fr));gap:24px}
    figure{margin:0}img,video{display:block;width:100%;border-radius:20px;background:#111}figcaption{font-size:.8rem;overflow-wrap:anywhere;margin-top:8px}
    .copy{display:grid;grid-template-columns:repeat(auto-fit,minmax(300px,1fr));gap:16px}.copy article{border:1px solid var(--line);border-radius:16px;padding:20px}
    pre{white-space:pre-wrap;overflow-wrap:anywhere;font:inherit}code{background:var(--accent);padding:.15em .4em;border-radius:6px}section{margin-top:48px}
  </style>
</head>
<body><main>
  <p>TROCO · REVISÃO LOCAL</p>
  <h1>Troco Social Review</h1>
  <p class="meta"><strong>${escapeXml(campaignId)}</strong><br>Publicação planejada: ${escapeXml(targetAt)}</p>
  <section><h2>Feed e carrossel</h2><div class="media">${imageMarkup}</div></section>
  <section><h2>Vídeo vertical</h2>
    <figure>
      <img src="${escapeXml(localAssetPath(root, video.thumbnail.file))}" alt="Capa vertical da campanha ${escapeXml(campaignId)}">
      <figcaption>Capa vertical · SHA-256 ${escapeXml(video.thumbnail.hash)}</figcaption>
    </figure>
    <video controls preload="metadata" src="${escapeXml(localAssetPath(root, video.file))}"></video>
    <p><code>${probe.width}×${probe.height}</code> <code>${probe.videoCodec}</code> <code>${probe.audioCodec}</code> <code>${probe.frameRate} fps</code> <code>${probe.duration}s</code></p>
    <p>Música: <code>${escapeXml(soundtrack.title)}</code> · ${escapeXml(soundtrack.artist)} · licença ${escapeXml(soundtrack.license)}${sourceLink ? ` · ${sourceLink}` : ""}</p>
    <p>SHA-256 ${escapeXml(video.hash)}</p>
  </section>
  <section><h2>Textos finais</h2><div class="copy">${channelMarkup}</div></section>
</main></body></html>`;
}

export async function createReview({
  localDate,
  output,
  brandRoot,
  publishTime = "12:17",
  ffmpegPath,
  ffprobePath,
}: Readonly<{
  localDate: string;
  output: string;
  brandRoot: URL;
  publishTime?: string;
  ffmpegPath?: string;
  ffprobePath?: string;
}>) {
  const outputRoot = resolve(output);
  await mkdir(outputRoot, { recursive: true });
  const plan = createCampaign({ localDate, publishTime, history: [] });
  const brand = await loadBrand(brandRoot);
  const feed = await renderFeed({
    plan,
    brand,
    output: join(outputRoot, "feed"),
  });
  const video = await renderVideo({
    plan,
    brand,
    output: join(outputRoot, "video"),
    ...(ffmpegPath ? { ffmpegPath } : {}),
    ...(ffprobePath ? { ffprobePath } : {}),
  });
  const manifest = {
    schemaVersion: 1,
    campaignId: plan.id,
    feed: feed.files.map((file, index) => ({
      path: localAssetPath(outputRoot, file),
      hash: feed.hashes[index],
      width: feed.width,
      height: feed.height,
      format: feed.format,
    })),
    video: {
      path: localAssetPath(outputRoot, video.file),
      hash: video.hash,
      thumbnail: {
        path: localAssetPath(outputRoot, video.thumbnail.file),
        hash: video.thumbnail.hash,
        width: video.thumbnail.width,
        height: video.thumbnail.height,
        format: video.thumbnail.format,
      },
      soundtrack: video.soundtrack,
      ...video.probe,
      ffmpegVersion: video.binaries.ffmpegVersion,
      ffprobeVersion: video.binaries.ffprobeVersion,
    },
  } as const;

  await Promise.all([
    atomicWrite(
      join(outputRoot, "campaign.json"),
      `${JSON.stringify(plan, null, 2)}\n`,
    ),
    atomicWrite(
      join(outputRoot, "captions.json"),
      `${JSON.stringify(plan.copy.channels, null, 2)}\n`,
    ),
    atomicWrite(
      join(outputRoot, "manifest.json"),
      `${JSON.stringify(manifest, null, 2)}\n`,
    ),
    atomicWrite(
      join(outputRoot, "index.html"),
      reviewHtml(
        plan.id,
        plan.targetAt,
        plan.copy.channels,
        feed,
        video,
        outputRoot,
      ),
    ),
  ]);

  return Object.freeze({
    plan,
    media: Object.freeze({ feed, video }),
    manifest: Object.freeze(manifest),
  });
}
