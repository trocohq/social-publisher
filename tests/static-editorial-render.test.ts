import assert from "node:assert/strict";
import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import sharp from "sharp";

import { loadBrand } from "../src/brand/load-brand.js";
import { parseStaticBatch } from "../src/static-editorial/markdown.js";
import { renderStaticEntry } from "../src/static-editorial/render.js";
import { createStaticSlideSvg } from "../src/render/static-slide.js";
import { canonicalBrandRoot } from "./support/brand-root.js";

const fixture = await readFile(
  new URL("./fixtures/static-editorial-batch.md", import.meta.url),
  "utf8",
);

test("uses the editorial-v2 layout and distinct narrative roles", async () => {
  const brand = await loadBrand(canonicalBrandRoot());
  const cover = createStaticSlideSvg({
    brand,
    slide: {
      role: "cover",
      title: "Recebeu um Pix por engano?",
      body: "Não devolva para outra conta.",
      index: 0,
      count: 5,
    },
  });
  const closing = createStaticSlideSvg({
    brand,
    slide: {
      role: "closing",
      title: "Pix inesperado",
      body: "Confira o extrato antes de devolver.",
      index: 4,
      count: 5,
    },
  });
  assert.match(cover, /data-static-layout="editorial-v2"/u);
  assert.match(cover, /NÃO CAIA NESSA/u);
  assert.match(closing, /SALVE ESTE PASSO A PASSO/u);
  assert.doesNotMatch(cover, /aria-hidden="true"/u);
  assert.match(cover, /<image x="80" y="80"/u);
  assert.match(cover, /<rect x="82" y="760" width="916"/u);
  assert.match(cover, /<text x="1000" y="1260"/u);
  assert.notEqual(cover, closing);
});

test("rejects a cover headline that would overlap the explanation card", async () => {
  const brand = await loadBrand(canonicalBrandRoot());
  assert.throws(() =>
    createStaticSlideSvg({
      brand,
      slide: {
        role: "cover",
        title:
          "Uma mensagem com detalhes demais sobre o golpe e a conta bancária. "
            .repeat(4)
            .slice(0, 240),
        body: "Confira antes de pagar.",
        index: 0,
        count: 5,
      },
    }),
  );
});

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
