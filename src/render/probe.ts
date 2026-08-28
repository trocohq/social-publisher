import { stat } from "node:fs/promises";

import ffprobeStatic from "ffprobe-static";

import { runProcess } from "./binaries.js";

type ProbeStream = Readonly<{
  codec_type?: string;
  codec_name?: string;
  width?: number;
  height?: number;
  avg_frame_rate?: string;
  r_frame_rate?: string;
  duration?: string;
  sample_rate?: string;
  channels?: number;
}>;

type ProbeOutput = Readonly<{
  streams?: readonly ProbeStream[];
  format?: Readonly<{
    format_name?: string;
    duration?: string;
    size?: string;
  }>;
}>;

export type VideoProbe = Readonly<{
  width: number;
  height: number;
  videoCodec: string;
  audioCodec: string;
  audioSampleRate: number;
  audioChannels: number;
  frameRate: number;
  duration: number;
  bytes: number;
  format: string;
}>;

function rationalNumber(value: string | undefined): number {
  if (!value) return Number.NaN;
  const [numerator, denominator = "1"] = value.split("/");
  const parsedDenominator = Number(denominator);
  return Number(numerator) / parsedDenominator;
}

export async function probeVideo(
  filePath: string,
  options: Readonly<{ ffprobePath?: string }> = {},
): Promise<VideoProbe> {
  const ffprobePath = options.ffprobePath ?? ffprobeStatic.path;
  const { stdout } = await runProcess(ffprobePath, [
    "-v",
    "error",
    "-show_streams",
    "-show_format",
    "-of",
    "json",
    filePath,
  ]);
  const raw = JSON.parse(stdout) as ProbeOutput;
  const video = raw.streams?.find((stream) => stream.codec_type === "video");
  const audio = raw.streams?.find((stream) => stream.codec_type === "audio");
  const frameRate = rationalNumber(
    video?.avg_frame_rate ?? video?.r_frame_rate,
  );
  const duration = Number(raw.format?.duration ?? video?.duration);
  const bytes = Number(raw.format?.size ?? (await stat(filePath)).size);
  const probe: VideoProbe = {
    width: Number(video?.width),
    height: Number(video?.height),
    videoCodec: video?.codec_name ?? "",
    audioCodec: audio?.codec_name ?? "",
    audioSampleRate: Number(audio?.sample_rate),
    audioChannels: Number(audio?.channels),
    frameRate,
    duration,
    bytes,
    format: raw.format?.format_name ?? "",
  };

  const valid =
    probe.format.split(",").includes("mp4") &&
    probe.videoCodec === "h264" &&
    probe.audioCodec === "aac" &&
    probe.audioSampleRate === 48_000 &&
    probe.audioChannels === 2 &&
    probe.width === 1080 &&
    probe.height === 1920 &&
    probe.frameRate === 30 &&
    probe.duration === 12 &&
    probe.bytes <= 50_000_000;
  if (!valid) {
    throw new Error(
      `Video failed its media contract: ${JSON.stringify(probe)}`,
    );
  }
  return Object.freeze(probe);
}
