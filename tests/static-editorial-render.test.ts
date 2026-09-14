import assert from "node:assert/strict";
import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import sharp from "sharp";

import { loadBrand } from "../src/brand/load-brand.js";
import { parseStaticBatch } from "../src/static-editorial/markdown.js";
import { renderStaticEntry } from "../src/static-editorial/render.js";
import { canonicalBrandRoot } from "./support/brand-root.js";

const fixture = await readFile(
  new URL("./fixtures/static-editorial-batch.md", import.meta.url),
  "utf8",
);

test("renders owner-authored static slides without campaign or video inputs", async () => {
  const output = await mkdtemp(join(tmpdir(), "troco-static-render-"));
  const brand = await loadBrand(canonicalBrandRoot());
  const entry = parseStaticBatch(fixture, "troco").entries[0]!;
  const rendered = await renderStaticEntry({
    entry,
    brand,
    output,
    rendererRevision: "troco-static-v1",
  });

  assert.equal(rendered.assets.length, 2);
  assert.deepEqual(
    rendered.assets.map(({ altText }) => altText),
    entry.slides.map(({ alt }) => alt),
  );
  for (const asset of rendered.assets) {
    const metadata = await sharp(asset.path).metadata();
    assert.deepEqual(
      [metadata.width, metadata.height, metadata.format, metadata.space],
      [1080, 1350, "jpeg", "srgb"],
    );
    assert.ok(asset.byteLength <= 8_000_000);
  }
});

test("changing the second authored slide changes only its bytes and the media revision", async () => {
  const brand = await loadBrand(canonicalBrandRoot());
  const entry = parseStaticBatch(fixture, "troco").entries[0]!;
  const first = await renderStaticEntry({
    entry,
    brand,
    output: await mkdtemp(join(tmpdir(), "troco-static-first-")),
    rendererRevision: "troco-static-v1",
  });
  const changedEntry = {
    ...entry,
    slides: [
      entry.slides[0]!,
      { ...entry.slides[1]!, body: "A revised owner-authored conclusion." },
    ],
  };
  const changed = await renderStaticEntry({
    entry: changedEntry,
    brand,
    output: await mkdtemp(join(tmpdir(), "troco-static-changed-")),
    rendererRevision: "troco-static-v1",
  });

  assert.equal(first.assets[0]!.sha256, changed.assets[0]!.sha256);
  assert.notEqual(first.assets[1]!.sha256, changed.assets[1]!.sha256);
  assert.notEqual(first.mediaRevision, changed.mediaRevision);
});
