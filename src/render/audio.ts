import { mkdir, writeFile } from "node:fs/promises";
import { dirname } from "node:path";

const SAMPLE_RATE = 48_000;
const CHANNELS = 1;
const BITS_PER_SAMPLE = 16;
const MAXIMUM_AMPLITUDE = 0.12;

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value));
}

function createWavHeader(dataBytes: number): Buffer {
  const header = Buffer.alloc(44);
  header.write("RIFF", 0, "ascii");
  header.writeUInt32LE(36 + dataBytes, 4);
  header.write("WAVE", 8, "ascii");
  header.write("fmt ", 12, "ascii");
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20);
  header.writeUInt16LE(CHANNELS, 22);
  header.writeUInt32LE(SAMPLE_RATE, 24);
  header.writeUInt32LE(SAMPLE_RATE * CHANNELS * (BITS_PER_SAMPLE / 8), 28);
  header.writeUInt16LE(CHANNELS * (BITS_PER_SAMPLE / 8), 32);
  header.writeUInt16LE(BITS_PER_SAMPLE, 34);
  header.write("data", 36, "ascii");
  header.writeUInt32LE(dataBytes, 40);
  return header;
}

export async function createToneBed({
  filePath,
  durationSeconds,
  cueTimes,
}: Readonly<{
  filePath: string;
  durationSeconds: number;
  cueTimes: readonly number[];
}>): Promise<string> {
  if (!Number.isFinite(durationSeconds) || durationSeconds <= 0) {
    throw new Error("Audio duration must be positive");
  }
  const sampleCount = Math.round(durationSeconds * SAMPLE_RATE);
  const samples = Buffer.alloc(sampleCount * 2);
  const fadeSeconds = 0.02;

  for (let index = 0; index < sampleCount; index += 1) {
    const time = index / SAMPLE_RATE;
    const edgeEnvelope = Math.min(
      1,
      time / fadeSeconds,
      (durationSeconds - time) / fadeSeconds,
    );
    const bed =
      0.032 * Math.sin(2 * Math.PI * 220 * time) +
      0.022 * Math.sin(2 * Math.PI * 330 * time);
    const cue = cueTimes.reduce((sum, cueTime) => {
      const distance = Math.abs(time - cueTime);
      if (distance >= fadeSeconds) return sum;
      const envelope = 1 - distance / fadeSeconds;
      return sum + 0.05 * envelope * Math.sin(2 * Math.PI * 660 * time);
    }, 0);
    const amplitude = clamp(
      (bed + cue) * Math.max(0, edgeEnvelope),
      -MAXIMUM_AMPLITUDE,
      MAXIMUM_AMPLITUDE,
    );
    samples.writeInt16LE(Math.round(amplitude * 32_767), index * 2);
  }

  await mkdir(dirname(filePath), { recursive: true });
  await writeFile(
    filePath,
    Buffer.concat([createWavHeader(samples.length), samples]),
  );
  return filePath;
}
