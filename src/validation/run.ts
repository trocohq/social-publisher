import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";

import { createReview } from "../dry-run/create-review.js";

async function validate(): Promise<void> {
  const output = await mkdtemp(join(tmpdir(), "troco-social-validation-"));
  const brandPath = resolve(process.env.BRAND_ROOT ?? "../frontend/public");
  try {
    const review = await createReview({
      localDate: "2026-08-26",
      output,
      brandRoot: pathToFileURL(`${brandPath}/`),
      ...(process.env.FFMPEG_PATH
        ? { ffmpegPath: process.env.FFMPEG_PATH }
        : {}),
      ...(process.env.FFPROBE_PATH
        ? { ffprobePath: process.env.FFPROBE_PATH }
        : {}),
    });
    process.stdout.write(
      `${JSON.stringify({ ok: true, campaignId: review.plan.id })}\n`,
    );
  } finally {
    await rm(output, { recursive: true, force: true });
  }
}

validate().catch((error: unknown) => {
  const message =
    error instanceof Error ? error.message : "Unknown validation error";
  process.stderr.write(`${JSON.stringify({ ok: false, error: message })}\n`);
  process.exitCode = 1;
});
