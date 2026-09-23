import { readFile } from "node:fs/promises";
import { basename } from "node:path";

import type { BrandAssets } from "../brand/load-brand.js";
import { renderFeedSvgs } from "../render/image.js";
import { createStaticSlideSvg } from "../render/static-slide.js";
import type { CompiledStaticEntry } from "./markdown.js";
import { canonicalJson, sha256 } from "./revision.js";

export async function renderStaticEntry(
  input: Readonly<{
    entry: CompiledStaticEntry;
    brand: BrandAssets;
    output: string;
    rendererRevision: string;
  }>,
) {
  if (!input.rendererRevision.trim())
    throw new Error("STATIC_RENDERER_REVISION_REQUIRED");
  const rendered = await renderFeedSvgs({
    svgs: input.entry.slides.map((slide, index) =>
      createStaticSlideSvg({
        slide: {
          role: slide.role,
          title: slide.title,
          body: slide.body,
          index,
          count: input.entry.slides.length,
        },
        brand: input.brand,
      }),
    ),
    output: input.output,
    filenamePrefix: "static",
  });
  const assets = await Promise.all(
    rendered.files.map(async (file, index) => ({
      path: file,
      filename: basename(file),
      mimeType: "image/jpeg" as const,
      width: rendered.width,
      height: rendered.height,
      byteLength: (await readFile(file)).byteLength,
      sha256: rendered.hashes[index]!,
      altText: input.entry.slides[index]!.alt,
    })),
  );
  const identity = {
    entryId: input.entry.id,
    contentRevision: input.entry.contentRevision,
    rendererRevision: input.rendererRevision,
    assets: assets.map(({ path: _path, ...asset }) => asset),
  };
  return Object.freeze({
    schemaVersion: 1 as const,
    ...identity,
    assets: Object.freeze(assets),
    mediaRevision: sha256(canonicalJson(identity)),
  });
}
