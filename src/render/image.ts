import { mkdir, readFile } from "node:fs/promises";
import { join, resolve } from "node:path";

import { designTokens } from "@trocohq/design-tokens";
import sharp from "sharp";

import type { BrandAssets } from "../brand/load-brand.js";
import type { CampaignPlan } from "../editorial/schema.js";
import { sha256 } from "../shared/determinism.js";
import { createFeedSlideSvg } from "./svg.js";

const WIDTH = 1080;
const HEIGHT = 1350;
const MAXIMUM_BYTES = 8_000_000;

export type RenderedFeed = Readonly<{
  files: readonly string[];
  hashes: readonly string[];
  width: 1080;
  height: 1350;
  format: "jpeg";
}>;

export async function renderFeedSvgs({
  svgs,
  output,
  filenamePrefix = "slide",
}: Readonly<{
  svgs: readonly string[];
  output: string;
  filenamePrefix?: string;
}>): Promise<RenderedFeed> {
  const outputRoot = resolve(output);
  await mkdir(outputRoot, { recursive: true });
  const files: string[] = [];
  const hashes: string[] = [];

  for (const [index, svg] of svgs.entries()) {
    const filename = `${filenamePrefix}-${String(index + 1).padStart(2, "0")}.jpg`;
    const filePath = join(outputRoot, filename);
    await sharp(Buffer.from(svg))
      .flatten({ background: designTokens.colors.paper })
      .toColourspace("srgb")
      .jpeg({ quality: 90, chromaSubsampling: "4:4:4", mozjpeg: true })
      .toFile(filePath);

    const metadata = await sharp(filePath).metadata();
    if (
      metadata.width !== WIDTH ||
      metadata.height !== HEIGHT ||
      metadata.format !== "jpeg" ||
      metadata.space !== "srgb"
    ) {
      throw new Error(`Rendered image failed its media contract: ${filename}`);
    }
    const bytes = await readFile(filePath);
    if (bytes.length > MAXIMUM_BYTES) {
      throw new Error(`Rendered image exceeds 8 MB: ${filename}`);
    }
    files.push(filePath);
    hashes.push(sha256(bytes));
  }

  return Object.freeze({
    files: Object.freeze(files),
    hashes: Object.freeze(hashes),
    width: WIDTH,
    height: HEIGHT,
    format: "jpeg",
  });
}

export async function renderFeed({
  plan,
  brand,
  output,
}: Readonly<{
  plan: CampaignPlan;
  brand: BrandAssets;
  output: string;
}>): Promise<RenderedFeed> {
  const count = plan.mediaKind === "carousel" ? plan.slideCount : 1;
  return renderFeedSvgs({
    svgs: Array.from({ length: count }, (_value, slide) =>
      createFeedSlideSvg({ plan, brand, slide }),
    ),
    output,
  });
}
