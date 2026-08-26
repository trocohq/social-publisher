import assert from "node:assert/strict";
import { mkdtemp, readFile, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { parseArguments } from "../src/cli/arguments.js";
import { createReview } from "../src/dry-run/create-review.js";

test("dry run writes a complete review bundle and no durable state", async () => {
  const output = await mkdtemp(join(tmpdir(), "troco-review-"));
  const review = await createReview({
    localDate: "2026-08-26",
    output,
    brandRoot: new URL("../../frontend/public/", import.meta.url),
  });

  assert.match(
    await readFile(join(output, "index.html"), "utf8"),
    /Troco Social Review/,
  );
  assert.equal(
    JSON.parse(await readFile(join(output, "campaign.json"), "utf8")).id,
    review.plan.id,
  );
  assert.ok(
    JSON.parse(
      await readFile(join(output, "captions.json"), "utf8"),
    ).instagram.caption.includes("utm_source=instagram"),
  );
  await assert.rejects(stat(join(output, "state")), /ENOENT/);
  assert.ok(review.media.video.hash.length === 64);
});

test("CLI arguments reject unknown flags and output traversal", () => {
  const workingRoot = "/tmp/troco-cli-root";
  assert.throws(
    () => parseArguments(["--unknown", "value"], workingRoot),
    /unknown argument/i,
  );
  assert.throws(
    () =>
      parseArguments(
        [
          "--date",
          "2026-08-26",
          "--output",
          "../outside",
          "--brand-root",
          "brand",
        ],
        workingRoot,
      ),
    /output.*working root/i,
  );
});
