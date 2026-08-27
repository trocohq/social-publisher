import { mkdir, writeFile } from "node:fs/promises";
import { dirname } from "node:path";

const SAMPLE_RATE = 48_000;
const CHANNELS = 2;
const BITS_PER_SAMPLE = 16;
const MAXIMUM_AMPLITUDE = 0.18;
const MUSIC_GAIN = 1.75;
const BPM = 100;
const BEAT_SECONDS = 60 / BPM;
const BAR_SECONDS = BEAT_SECONDS * 4;

const chordProgression = [
  [261.63, 329.63, 392],
  [196, 246.94, 293.66],
  [220, 261.63, 329.63],
  [174.61, 220, 261.63],
  [261.63, 329.63, 392],
] as const;

const melody = [
  392, 523.25, 659.25, 523.25, 392, 493.88, 587.33, 493.88, 440, 523.25, 659.25,
  523.25, 349.23, 440, 523.25, 440, 392, 523.25, 659.25, 783.99,
] as const;

function softLimit(value: number): number {
  return MAXIMUM_AMPLITUDE * Math.tanh(value / MAXIMUM_AMPLITUDE);
}

function sine(frequency: number, time: number): number {
  return Math.sin(2 * Math.PI * frequency * time);
}

function triangle(frequency: number, time: number): number {
  return (2 / Math.PI) * Math.asin(sine(frequency, time));
}

function deterministicNoise(index: number): number {
  const raw = Math.sin((index + 1) * 12.9898) * 43_758.5453;
  return (raw - Math.floor(raw)) * 2 - 1;
}

function attackRelease(
  localTime: number,
  duration: number,
  attack: number,
  release: number,
): number {
  return Math.max(
    0,
    Math.min(1, localTime / attack, (duration - localTime) / release),
  );
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
  const frameCount = Math.round(durationSeconds * SAMPLE_RATE);
  const samples = Buffer.alloc(frameCount * CHANNELS * 2);
  const fadeSeconds = 0.06;

  for (let index = 0; index < frameCount; index += 1) {
    const time = index / SAMPLE_RATE;
    const edgeEnvelope = Math.min(
      1,
      time / fadeSeconds,
      (durationSeconds - time) / fadeSeconds,
    );
    const barIndex = Math.min(
      chordProgression.length - 1,
      Math.floor(time / BAR_SECONDS),
    );
    const chord = chordProgression[barIndex]!;
    const barTime = time - barIndex * BAR_SECONDS;
    const padEnvelope = attackRelease(barTime, BAR_SECONDS, 0.12, 0.24);
    const leftPad =
      padEnvelope *
      (0.018 * triangle(chord[0], time) +
        0.014 * sine(chord[1], time) +
        0.009 * sine(chord[2], time));
    const rightPad =
      padEnvelope *
      (0.012 * sine(chord[0], time) +
        0.017 * triangle(chord[1], time) +
        0.012 * sine(chord[2], time));

    const beatTime = time % BEAT_SECONDS;
    const bassEnvelope = Math.exp(-3.6 * beatTime);
    const bass = 0.025 * bassEnvelope * sine(chord[0] / 2, time);
    const kickFrequency = 54 + 58 * Math.exp(-22 * beatTime);
    const kick =
      0.105 * Math.exp(-15 * beatTime) * sine(kickFrequency, beatTime);

    const eighthSeconds = BEAT_SECONDS / 2;
    const eighthIndex = Math.floor(time / eighthSeconds);
    const pluckTime = time - eighthIndex * eighthSeconds;
    const pluckEnvelope = Math.exp(-10 * pluckTime);
    const pluckFrequency = melody[eighthIndex % melody.length]!;
    const pluck =
      0.041 *
      pluckEnvelope *
      (sine(pluckFrequency, pluckTime) +
        0.24 * sine(pluckFrequency * 2, pluckTime));

    const shakerTime = beatTime - eighthSeconds;
    const shaker =
      shakerTime >= 0
        ? 0.013 * Math.exp(-34 * shakerTime) * deterministicNoise(index)
        : 0;
    const cue = cueTimes.reduce((sum, cueTime) => {
      const cueTimeLocal = time - cueTime;
      if (cueTimeLocal < 0 || cueTimeLocal >= 0.32) return sum;
      const envelope = Math.exp(-9 * cueTimeLocal);
      return (
        sum +
        0.032 *
          envelope *
          (sine(659.25, cueTimeLocal) + 0.5 * sine(783.99, cueTimeLocal))
      );
    }, 0);
    const left = softLimit(
      MUSIC_GAIN *
        (leftPad + bass + kick + pluck * 0.58 + shaker * 0.72 + cue) *
        Math.max(0, edgeEnvelope),
    );
    const right = softLimit(
      MUSIC_GAIN *
        (rightPad + bass + kick + pluck * 0.9 + shaker + cue * 0.82) *
        Math.max(0, edgeEnvelope),
    );
    const frameOffset = index * CHANNELS * 2;
    samples.writeInt16LE(Math.round(left * 32_767), frameOffset);
    samples.writeInt16LE(Math.round(right * 32_767), frameOffset + 2);
  }

  await mkdir(dirname(filePath), { recursive: true });
  await writeFile(
    filePath,
    Buffer.concat([createWavHeader(samples.length), samples]),
  );
  return filePath;
}
