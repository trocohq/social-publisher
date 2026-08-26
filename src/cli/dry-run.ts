import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { createReview } from "../dry-run/create-review.js";
import { parseArguments } from "./arguments.js";

export async function runDryRun(
  args: readonly string[],
  workingRoot = process.cwd(),
): Promise<void> {
  const options = parseArguments(args, workingRoot);
  const review = await createReview({
    localDate: options.localDate,
    output: options.output,
    brandRoot: options.brandRoot,
    ...(options.ffmpegPath ? { ffmpegPath: options.ffmpegPath } : {}),
    ...(options.ffprobePath ? { ffprobePath: options.ffprobePath } : {}),
  });
  process.stdout.write(
    `${JSON.stringify({
      ok: true,
      campaignId: review.plan.id,
      feedFiles: review.media.feed.files.length,
      video: {
        width: review.media.video.probe.width,
        height: review.media.video.probe.height,
        duration: review.media.video.probe.duration,
      },
    })}\n`,
  );
}

const invokedPath = process.argv[1] ? resolve(process.argv[1]) : "";
if (invokedPath === fileURLToPath(import.meta.url)) {
  runDryRun(process.argv.slice(2)).catch((error: unknown) => {
    const message =
      error instanceof Error ? error.message : "Unknown dry-run error";
    process.stderr.write(`${JSON.stringify({ ok: false, error: message })}\n`);
    process.exitCode = 1;
  });
}
