import { readFile } from "node:fs/promises";

import sharp from "sharp";

import { sha256 as digest } from "../shared/determinism.js";

export async function verifyStaticAssets(
  assets: readonly Readonly<{
    path: string;
    width: number;
    height: number;
    byteLength: number;
    sha256: string;
  }>[],
): Promise<void> {
  for (const asset of assets) {
    const bytes = await readFile(asset.path);
    const metadata = await sharp(bytes).metadata();
    if (
      metadata.format !== "jpeg" ||
      metadata.width !== asset.width ||
      metadata.height !== asset.height ||
      metadata.space !== "srgb" ||
      bytes.byteLength !== asset.byteLength ||
      digest(bytes) !== asset.sha256 ||
      bytes.byteLength > 8_000_000
    ) {
      throw new Error("STATIC_MEDIA_VERIFICATION_FAILED");
    }
  }
}
