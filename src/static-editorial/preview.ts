import { writeFile } from "node:fs/promises";
import { join } from "node:path";

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

export async function writeStaticPreview(
  output: string,
  entryId: string,
  mediaRevision: string,
  assets: readonly Readonly<{
    filename: string;
    altText: string;
    sha256: string;
  }>[],
): Promise<string> {
  const htmlPath = join(output, "review.html");
  const figures = assets
    .map(
      (asset) =>
        `<figure><img src="${escapeHtml(asset.filename)}" alt="${escapeHtml(asset.altText)}" width="540" height="675"><figcaption>${escapeHtml(asset.sha256)}</figcaption></figure>`,
    )
    .join("\n");
  await writeFile(
    htmlPath,
    `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>${escapeHtml(entryId)} review</title></head><body><header><strong>REVIEW ONLY — NOT APPROVED</strong><p>${escapeHtml(mediaRevision)}</p></header><main>${figures}</main></body></html>\n`,
    { encoding: "utf8", flag: "wx", mode: 0o600 },
  );
  return htmlPath;
}
