import { mkdir, mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

import sharp from "sharp";

import type { BrandAssets } from "../brand/load-brand.js";
import type { CampaignPlan } from "../editorial/schema.js";
import { sha256 } from "../shared/determinism.js";
import {
  soundtrackForCampaign,
  verifyVerticalSoundtrack,
  type VerticalSoundtrack,
} from "./music.js";
import {
  resolveMediaBinaries,
  runProcess,
  type MediaBinaries,
} from "./binaries.js";
import { probeVideo, type VideoProbe } from "./probe.js";
import {
  createVerticalSceneSvg,
  createVerticalThumbnailSvg,
  verticalScenes,
} from "./svg.js";
import { renderVideoThumbnail, type RenderedThumbnail } from "./thumbnail.js";

const SCENE_SECONDS = 3;
const TOTAL_SECONDS = SCENE_SECONDS * verticalScenes.length;

export type RenderedVideo = Readonly<{
  file: string;
  hash: string;
  probe: VideoProbe;
  binaries: MediaBinaries;
  soundtrack: RenderedSoundtrack;
  thumbnail: RenderedThumbnail;
}>;

export type RenderedSoundtrack = Readonly<
  Pick<
    VerticalSoundtrack,
    "id" | "title" | "artist" | "license" | "source" | "durationSeconds"
  >
>;

function renderedSoundtrack(
  soundtrack: VerticalSoundtrack,
): RenderedSoundtrack {
  return Object.freeze({
    id: soundtrack.id,
    title: soundtrack.title,
    artist: soundtrack.artist,
    license: soundtrack.license,
    source: soundtrack.source,
    durationSeconds: soundtrack.durationSeconds,
  });
}

export function buildVideoFfmpegArguments({
  plan,
  sceneFiles,
  soundtrack,
  videoPath,
}: Readonly<{
  plan: CampaignPlan;
  sceneFiles: readonly string[];
  soundtrack: VerticalSoundtrack;
  videoPath: string;
}>): string[] {
  const args: string[] = ["-y", "-hide_banner", "-loglevel", "error"];
  for (const scenePath of sceneFiles) {
    args.push(
      "-loop",
      "1",
      "-framerate",
      "30",
      "-t",
      String(SCENE_SECONDS),
      "-i",
      scenePath,
    );
  }
  args.push("-stream_loop", "-1", "-i", soundtrack.filePath);
  const videoFilters = sceneFiles
    .map(
      (_, index) =>
        `[${index}:v]fps=30,scale=1080:1920:flags=lanczos,format=yuv420p[v${index}]`,
    )
    .join(";");
  const concatInputs = sceneFiles.map((_, index) => `[v${index}]`).join("");
  const audioInputIndex = sceneFiles.length;
  const audioFilter =
    `[${audioInputIndex}:a:0]` +
    `atrim=start=0:duration=${TOTAL_SECONDS},` +
    "asetpts=PTS-STARTPTS," +
    "volume=0.70," +
    "afade=t=in:st=0:d=0.35," +
    "afade=t=out:st=11.35:d=0.65," +
    "alimiter=limit=0.88:attack=5:release=50:level=false[a]";
  args.push(
    "-filter_complex",
    `${videoFilters};${concatInputs}concat=n=${sceneFiles.length}:v=1:a=0[v];${audioFilter}`,
    "-map",
    "[v]",
    "-map",
    "[a]",
    "-c:v",
    "libx264",
    "-preset",
    "medium",
    "-crf",
    "20",
    "-pix_fmt",
    "yuv420p",
    "-r",
    "30",
    "-threads",
    "1",
    "-c:a",
    "aac",
    "-b:a",
    "128k",
    "-ar",
    "48000",
    "-ac",
    "2",
    "-t",
    String(TOTAL_SECONDS),
    "-movflags",
    "+faststart",
    "-metadata",
    `title=${plan.id}`,
    "-metadata",
    "creation_time=1970-01-01T00:00:00Z",
    "-metadata",
    "encoder=Troco Social Publisher",
    videoPath,
  );
  return args;
}

export async function renderVideo({
  plan,
  brand,
  output,
  ffmpegPath,
  ffprobePath,
}: Readonly<{
  plan: CampaignPlan;
  brand: BrandAssets;
  output: string;
  ffmpegPath?: string;
  ffprobePath?: string;
}>): Promise<RenderedVideo> {
  const binaries = await resolveMediaBinaries({
    ...(ffmpegPath ? { ffmpegPath } : {}),
    ...(ffprobePath ? { ffprobePath } : {}),
  });
  const outputRoot = resolve(output);
  const soundtrack = soundtrackForCampaign(plan.id);
  await verifyVerticalSoundtrack(soundtrack, binaries.ffprobePath);
  await mkdir(outputRoot, { recursive: true });
  const temporaryRoot = await mkdtemp(join(tmpdir(), "troco-video-scenes-"));
  const videoPath = join(outputRoot, "short.mp4");
  const thumbnailSvg = createVerticalThumbnailSvg({ plan, brand });
  const thumbnail = await renderVideoThumbnail({
    svg: thumbnailSvg,
    output: outputRoot,
  });

  try {
    const sceneFiles: string[] = [];
    for (const [index, scene] of verticalScenes.entries()) {
      const scenePath = join(
        temporaryRoot,
        `scene-${String(index + 1).padStart(2, "0")}.png`,
      );
      const svg =
        scene === "hook"
          ? thumbnailSvg
          : createVerticalSceneSvg({ plan, brand, scene });
      await sharp(Buffer.from(svg))
        .toColourspace("srgb")
        .png({ compressionLevel: 9, adaptiveFiltering: false })
        .toFile(scenePath);
      const metadata = await sharp(scenePath).metadata();
      if (metadata.width !== 1080 || metadata.height !== 1920) {
        throw new Error(`Vertical scene failed its dimensions: ${scene}`);
      }
      sceneFiles.push(scenePath);
    }

    const args = buildVideoFfmpegArguments({
      plan,
      sceneFiles,
      soundtrack,
      videoPath,
    });
    await runProcess(binaries.ffmpegPath, args);

    const probe = await probeVideo(videoPath, {
      ffprobePath: binaries.ffprobePath,
    });
    const bytes = await readFile(videoPath);
    return Object.freeze({
      file: videoPath,
      hash: sha256(bytes),
      probe,
      binaries,
      soundtrack: renderedSoundtrack(soundtrack),
      thumbnail,
    });
  } finally {
    await rm(temporaryRoot, { recursive: true, force: true });
  }
}
