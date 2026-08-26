import { lstat, readFile, realpath } from "node:fs/promises";
import { dirname, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

import { sha256 } from "../shared/determinism.js";
import { brandManifest, type BrandAssetPath } from "./manifest.js";

export type BrandAssets = Readonly<{
  markSvg: string;
  inverseMarkSvg: string;
  stolzl: Buffer;
  figtree: Buffer;
}>;

function missingAsset(path: string, cause?: unknown): Error {
  return new Error(`Missing canonical brand asset: ${path}`, { cause });
}

function validateSvg(path: string, source: string): void {
  const forbidden = [
    /<script\b/i,
    /<foreignObject\b/i,
    /<!DOCTYPE\b/i,
    /(?:href|xlink:href)\s*=\s*["']\s*(?!#)/i,
    /url\(\s*["']?(?:https?:|\/\/)/i,
  ];
  if (forbidden.some((pattern) => pattern.test(source))) {
    throw new Error(`Unsafe canonical SVG asset: ${path}`);
  }
  if (!/<svg\b/i.test(source) || !/viewBox="0 0 1080 1080"/.test(source)) {
    throw new Error(`Invalid canonical SVG asset: ${path}`);
  }
}

async function loadAsset(
  rootPath: string,
  canonicalRoot: string,
  assetPath: BrandAssetPath,
): Promise<Buffer> {
  const requestedPath = resolve(rootPath, assetPath);
  let stats;
  try {
    stats = await lstat(requestedPath);
  } catch (error) {
    throw missingAsset(assetPath, error);
  }
  if (stats.isSymbolicLink() || !stats.isFile()) {
    throw new Error(
      `Canonical brand asset must be a regular file: ${assetPath}`,
    );
  }

  const canonicalPath = await realpath(requestedPath);
  const withinRoot = relative(canonicalRoot, canonicalPath);
  if (withinRoot.startsWith(`..${sep}`) || withinRoot === "..") {
    throw new Error(`Canonical brand asset escapes its root: ${assetPath}`);
  }

  const bytes = await readFile(canonicalPath);
  if (bytes.length === 0)
    throw new Error(`Canonical brand asset is empty: ${assetPath}`);
  if (sha256(bytes) !== brandManifest[assetPath]) {
    throw new Error(`Canonical brand asset hash mismatch: ${assetPath}`);
  }
  return bytes;
}

export async function loadBrand(root: URL): Promise<BrandAssets> {
  const rootPath = resolve(fileURLToPath(root));
  let canonicalRoot: string;
  try {
    canonicalRoot = await realpath(rootPath);
  } catch (error) {
    throw missingAsset(dirname(rootPath), error);
  }

  const [mark, inverseMark, stolzl, figtree] = await Promise.all([
    loadAsset(rootPath, canonicalRoot, "brand/troco-mark.svg"),
    loadAsset(rootPath, canonicalRoot, "brand/troco-mark-inverse.svg"),
    loadAsset(rootPath, canonicalRoot, "fonts/stolzl-regular.woff2"),
    loadAsset(rootPath, canonicalRoot, "fonts/figtree-variable.ttf"),
  ]);
  const markSvg = mark.toString("utf8");
  const inverseMarkSvg = inverseMark.toString("utf8");
  validateSvg("brand/troco-mark.svg", markSvg);
  validateSvg("brand/troco-mark-inverse.svg", inverseMarkSvg);

  return Object.freeze({ markSvg, inverseMarkSvg, stolzl, figtree });
}
