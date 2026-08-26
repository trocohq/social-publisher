import { spawn } from "node:child_process";
import { stat } from "node:fs/promises";

import ffmpegStatic from "ffmpeg-static";
import ffprobeStatic from "ffprobe-static";

export type ProcessResult = Readonly<{
  stdout: string;
  stderr: string;
}>;

export async function runProcess(
  executable: string,
  args: readonly string[],
): Promise<ProcessResult> {
  return new Promise((resolve, reject) => {
    const child = spawn(executable, [...args], {
      shell: false,
      stdio: ["ignore", "pipe", "pipe"],
    });
    const stdout: Buffer[] = [];
    const stderr: Buffer[] = [];
    child.stdout.on("data", (chunk: Buffer) => stdout.push(chunk));
    child.stderr.on("data", (chunk: Buffer) => stderr.push(chunk));
    child.once("error", reject);
    child.once("close", (code) => {
      const result = {
        stdout: Buffer.concat(stdout).toString("utf8"),
        stderr: Buffer.concat(stderr).toString("utf8"),
      };
      if (code === 0) resolve(result);
      else {
        reject(
          new Error(
            `${executable} exited with code ${String(code)}: ${result.stderr.slice(-2_000)}`,
          ),
        );
      }
    });
  });
}

async function requireExecutable(path: string, label: string): Promise<void> {
  const metadata = await stat(path).catch((error: unknown) => {
    throw new Error(`${label} executable is missing: ${path}`, {
      cause: error,
    });
  });
  if (!metadata.isFile())
    throw new Error(`${label} path is not a file: ${path}`);
  if (process.platform !== "win32" && (metadata.mode & 0o111) === 0) {
    throw new Error(`${label} file is not executable: ${path}`);
  }
}

function firstLine(value: string): string {
  return value.trim().split(/\r?\n/, 1)[0] ?? "";
}

export type MediaBinaries = Readonly<{
  ffmpegPath: string;
  ffprobePath: string;
  ffmpegVersion: string;
  ffprobeVersion: string;
}>;

function bundledFfmpegPath(): string | null {
  const imported: unknown = ffmpegStatic;
  if (typeof imported === "string") return imported;
  if (imported && typeof imported === "object" && "default" in imported) {
    const value = (imported as { default?: unknown }).default;
    return typeof value === "string" ? value : null;
  }
  return null;
}

export async function resolveMediaBinaries(
  overrides: Readonly<{ ffmpegPath?: string; ffprobePath?: string }> = {},
): Promise<MediaBinaries> {
  const ffmpegPath = overrides.ffmpegPath ?? bundledFfmpegPath();
  const ffprobePath = overrides.ffprobePath ?? ffprobeStatic.path;
  if (!ffmpegPath)
    throw new Error("No FFmpeg binary is available for this platform");

  await Promise.all([
    requireExecutable(ffmpegPath, "FFmpeg"),
    requireExecutable(ffprobePath, "FFprobe"),
  ]);
  const [ffmpegVersion, ffprobeVersion] = await Promise.all([
    runProcess(ffmpegPath, ["-version"]),
    runProcess(ffprobePath, ["-version"]),
  ]);

  return Object.freeze({
    ffmpegPath,
    ffprobePath,
    ffmpegVersion: firstLine(ffmpegVersion.stdout || ffmpegVersion.stderr),
    ffprobeVersion: firstLine(ffprobeVersion.stdout || ffprobeVersion.stderr),
  });
}
