import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

import { sha256 } from "../shared/determinism.js";
import { runProcess } from "./binaries.js";

const MILLISECONDS_PER_DAY = 86_400_000;

export const ENTERPRISE_MUSIC_SHA256 =
  "d3884500099f06adc74583242056be7249f7758c4d1919efc6de3ccdf468029e";
export const enterpriseMusicPath = fileURLToPath(
  new URL("../../assets/music/enterprise.mp3", import.meta.url),
);

export type MusicExcerpt = Readonly<{
  id: string;
  startSeconds: number;
  durationSeconds: 12;
}>;

export const enterpriseMusicExcerpts: readonly MusicExcerpt[] = Object.freeze(
  [2, 16, 30, 44, 58, 72, 86, 100, 116].map((startSeconds, index) =>
    Object.freeze({
      id: `enterprise-${String(index + 1).padStart(2, "0")}`,
      startSeconds,
      durationSeconds: 12 as const,
    }),
  ),
);

function localDateOrdinal(localDate: string): number {
  if (!/^\d{4}-\d{2}-\d{2}$/u.test(localDate)) {
    throw new Error("Invalid local date");
  }
  const parsed = new Date(`${localDate}T00:00:00Z`);
  if (
    Number.isNaN(parsed.valueOf()) ||
    parsed.toISOString().slice(0, 10) !== localDate
  ) {
    throw new Error("Invalid local date");
  }
  return Math.floor(parsed.valueOf() / MILLISECONDS_PER_DAY);
}

export function musicExcerptForDate(localDate: string): MusicExcerpt {
  const ordinal = localDateOrdinal(localDate);
  const index =
    ((ordinal % enterpriseMusicExcerpts.length) +
      enterpriseMusicExcerpts.length) %
    enterpriseMusicExcerpts.length;
  return enterpriseMusicExcerpts[index]!;
}

export type MusicSourceProbe = Readonly<{
  durationSeconds: number;
  channels: number;
  sampleRate: number;
}>;

export async function verifyMusicSource({
  filePath,
  expectedSha256,
  minimumDurationSeconds,
  expectedChannels,
  expectedSampleRate,
  ffprobePath,
}: Readonly<{
  filePath: string;
  expectedSha256: string;
  minimumDurationSeconds: number;
  expectedChannels: number;
  expectedSampleRate: number;
  ffprobePath: string;
}>): Promise<MusicSourceProbe> {
  const bytes = await readFile(filePath).catch(() => {
    throw new Error("Approved music source is missing");
  });
  if (sha256(bytes) !== expectedSha256) {
    throw new Error("Approved music source digest mismatch");
  }

  const result = await runProcess(ffprobePath, [
    "-v",
    "error",
    "-show_entries",
    "stream=codec_type,sample_rate,channels:format=duration",
    "-of",
    "json",
    filePath,
  ]).catch((error: unknown) => {
    throw new Error("Approved music source could not be probed", {
      cause: error,
    });
  });
  const parsed = JSON.parse(result.stdout) as {
    streams?: readonly Readonly<{
      codec_type?: string;
      sample_rate?: string;
      channels?: number;
    }>[];
    format?: Readonly<{ duration?: string }>;
  };
  const audio = parsed.streams?.find((stream) => stream.codec_type === "audio");
  const probe = Object.freeze({
    durationSeconds: Number(parsed.format?.duration),
    channels: Number(audio?.channels),
    sampleRate: Number(audio?.sample_rate),
  });
  if (
    !Number.isFinite(probe.durationSeconds) ||
    probe.durationSeconds < minimumDurationSeconds
  ) {
    throw new Error("Approved music source duration is insufficient");
  }
  if (probe.channels !== expectedChannels) {
    throw new Error("Approved music source channel count is invalid");
  }
  if (probe.sampleRate !== expectedSampleRate) {
    throw new Error("Approved music source sample rate is invalid");
  }
  return probe;
}

export function verifyEnterpriseMusicSource(
  ffprobePath: string,
): Promise<MusicSourceProbe> {
  return verifyMusicSource({
    filePath: enterpriseMusicPath,
    expectedSha256: ENTERPRISE_MUSIC_SHA256,
    minimumDurationSeconds: 128,
    expectedChannels: 2,
    expectedSampleRate: 44_100,
    ffprobePath,
  });
}
