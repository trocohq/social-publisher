import assert from "node:assert/strict";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import {
  parseStaticPreviewArgs,
  runStaticPreview,
} from "../src/cli/preview-static-editorial.js";
import { canonicalBrandRoot } from "./support/brand-root.js";

test("writes a review-only HTML page for exact final static assets", async () => {
  const root = await mkdtemp(join(tmpdir(), "troco-static-preview-"));
  const source = join(root, "batch.md");
  const output = join(root, "review");
  await writeFile(
    source,
    await readFile(
      new URL("./fixtures/static-editorial-batch.md", import.meta.url),
    ),
  );
  const result = await runStaticPreview({
    source,
    entryId: "troco-editorial-0001",
    brandRoot: canonicalBrandRoot(),
    output,
    projectRoot: process.cwd(),
  });
  const html = await readFile(result.htmlPath, "utf8");
  assert.match(html, /REVIEW ONLY — NOT APPROVED/u);
  assert.match(html, /static-01\.jpg/u);
  assert.match(html, /static-02\.jpg/u);
  assert.doesNotMatch(html, /approved: true/u);
});

test("requires explicit absolute Markdown, brand, and private output paths", () => {
  assert.throws(
    () =>
      parseStaticPreviewArgs(
        [
          "--source",
          "relative.md",
          "--entry",
          "troco-editorial-0001",
          "--brand-root",
          "/private/brand",
          "--output",
          "/private/review",
        ],
        process.cwd(),
      ),
    /STATIC_PREVIEW_SOURCE_ABSOLUTE_REQUIRED/u,
  );
});
