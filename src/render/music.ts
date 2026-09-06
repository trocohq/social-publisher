import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

import { chooseSeeded, sha256 } from "../shared/determinism.js";
import { resolveMediaBinaries, runProcess } from "./binaries.js";

const FFPROBE_DURATION_TOLERANCE_SECONDS = 0.05;
const VERTICAL_SOUNDTRACK_SEED_OFFSET = 41;

export type VerticalSoundtrack = Readonly<{
  id: "funked-up" | "funky-house";
  title: string;
  artist: string;
  license: "CC0-1.0";
  source: string;
  filePath: string;
  sha256: string;
  durationSeconds: 9;
}>;

export const verticalSoundtracks: readonly VerticalSoundtrack[] = Object.freeze(
  [
    Object.freeze({
      id: "funked-up" as const,
      title: "Funked Up",
      artist: "Joth",
      license: "CC0-1.0" as const,
      source: "https://opengameart.org/content/funked-up",
      filePath: fileURLToPath(
        new URL("../../assets/music/funked-up.mp3", import.meta.url),
      ),
      sha256:
        "e2fa908a762add9ae8784832c14707525d7c7375cdd8c28217d0857967a79828",
      durationSeconds: 9 as const,
    }),
    Object.freeze({
      id: "funky-house" as const,
      title: "Funky House",
      artist: "Of Far Different Nature",
      license: "CC0-1.0" as const,
      source: "https://opengameart.org/content/funky-house",
      filePath: fileURLToPath(
        new URL("../../assets/music/funky-house.mp3", import.meta.url),
      ),
      sha256:
        "1422a4630babedd49544dfa7d56399918841c86154d6f19ee61bbbc9f6693435",
      durationSeconds: 9 as const,
    }),
  ],
);

export function soundtrackForCampaign(campaignId: string): VerticalSoundtrack {
  if (campaignId.trim() === "") {
    throw new Error("Campaign ID must not be empty");
  }
  // Keeps soundtrack assignment stable while independent from editorial choices.
  return chooseSeeded(
    verticalSoundtracks,
    campaignId,
    VERTICAL_SOUNDTRACK_SEED_OFFSET,
  );
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
  maximumDurationSeconds,
  exactDurationSeconds,
  expectedChannels,
  expectedSampleRate,
  ffprobePath,
}: Readonly<{
  filePath: string;
  expectedSha256: string;
  minimumDurationSeconds?: number;
  maximumDurationSeconds?: number;
  exactDurationSeconds?: number;
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
  if (!Number.isFinite(probe.durationSeconds)) {
    throw new Error("Approved music source duration is invalid");
  }
  if (
    minimumDurationSeconds !== undefined &&
    probe.durationSeconds + FFPROBE_DURATION_TOLERANCE_SECONDS <
      minimumDurationSeconds
  ) {
    throw new Error("Approved music source duration is insufficient");
  }
  if (
    maximumDurationSeconds !== undefined &&
    probe.durationSeconds - FFPROBE_DURATION_TOLERANCE_SECONDS >
      maximumDurationSeconds
  ) {
    throw new Error(
      "Approved music source duration exceeds the approved limit",
    );
  }
  if (
    exactDurationSeconds !== undefined &&
    Math.abs(probe.durationSeconds - exactDurationSeconds) >
      FFPROBE_DURATION_TOLERANCE_SECONDS
  ) {
    throw new Error(
      "Approved music source duration does not match the approved length",
    );
  }
  if (probe.channels !== expectedChannels) {
    throw new Error("Approved music source channel count is invalid");
  }
  if (probe.sampleRate !== expectedSampleRate) {
    throw new Error("Approved music source sample rate is invalid");
  }
  return probe;
}

export async function verifyVerticalSoundtrack(
  soundtrack: VerticalSoundtrack,
  ffprobePath?: string,
): Promise<MusicSourceProbe> {
  const resolvedFfprobePath =
    ffprobePath ?? (await resolveMediaBinaries()).ffprobePath;
  return verifyMusicSource({
    filePath: soundtrack.filePath,
    expectedSha256: soundtrack.sha256,
    exactDurationSeconds: soundtrack.durationSeconds,
    expectedChannels: 2,
    expectedSampleRate: 48_000,
    ffprobePath: resolvedFfprobePath,
  });
}
