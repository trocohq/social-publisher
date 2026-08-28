import { mkdir, readFile } from "node:fs/promises";
import { join, resolve } from "node:path";

import { designTokens } from "@trocohq/design-tokens";
import sharp from "sharp";

import { sha256 } from "../shared/determinism.js";

const WIDTH = 1080;
const HEIGHT = 1920;
const MAXIMUM_BYTES = 8_000_000;

export type RenderedThumbnail = Readonly<{
  file: string;
  hash: string;
  width: 1080;
  height: 1920;
  format: "jpeg";
}>;

export async function renderVideoThumbnail({
  svg,
  output,
}: Readonly<{
  svg: string;
  output: string;
}>): Promise<RenderedThumbnail> {
  const outputRoot = resolve(output);
  await mkdir(outputRoot, { recursive: true });
  const file = join(outputRoot, "thumbnail.jpg");
  await sharp(Buffer.from(svg))
    .flatten({ background: designTokens.colors.paper })
    .toColourspace("srgb")
    .jpeg({ quality: 90, chromaSubsampling: "4:4:4", mozjpeg: true })
    .toFile(file);
  const metadata = await sharp(file).metadata();
  if (
    metadata.width !== WIDTH ||
    metadata.height !== HEIGHT ||
    metadata.format !== "jpeg" ||
    metadata.space !== "srgb"
  ) {
    throw new Error("Rendered thumbnail failed its media contract");
  }
  const bytes = await readFile(file);
  if (bytes.length > MAXIMUM_BYTES) {
    throw new Error("Rendered thumbnail exceeds 8 MB");
  }
  return Object.freeze({
    file,
    hash: sha256(bytes),
    width: WIDTH,
    height: HEIGHT,
    format: "jpeg",
  });
}
