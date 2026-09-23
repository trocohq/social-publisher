import { lstat, readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { sha256 } from "../shared/determinism.js";

export const approvedArtHashes = [
  "cc819ef56594efdd10fdc69cae685da5415fcaf552efb81a1e9108371954e1e1",
  "bb8e7ae76001ce8c56cbe2cd0160639d3901ce081630e91dcdd1f1638071c6b9",
  "44060932f77cd9b7b21aff8708be52de670f6b9436296343e010a30ae730b226",
] as const;

export async function loadApprovedArt(
  root: string,
): Promise<readonly string[]> {
  const directory = resolve(root);
  const stat = await lstat(directory);
  if (!stat.isDirectory() || stat.isSymbolicLink())
    throw new Error("Approved artwork requires a real directory");
  return Promise.all(
    approvedArtHashes.map(async (hash, index) => {
      const path = resolve(directory, `${index}.png`);
      const stat = await lstat(path);
      if (!stat.isFile() || stat.isSymbolicLink())
        throw new Error("Approved artwork must be a regular file");
      const bytes = await readFile(path);
      if (sha256(bytes) !== hash)
        throw new Error(`Approved artwork ${index} hash mismatch`);
      return bytes.toString("base64");
    }),
  );
}
