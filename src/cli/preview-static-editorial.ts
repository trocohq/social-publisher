import { access, readFile } from "node:fs/promises";
import { extname, isAbsolute, resolve, sep } from "node:path";
import { fileURLToPath, pathToFileURL, type URL } from "node:url";

import { loadBrand } from "../brand/load-brand.js";
import { parseStaticBatch } from "../static-editorial/markdown.js";
import { verifyStaticAssets } from "../static-editorial/media.js";
import { writeStaticPreview } from "../static-editorial/preview.js";
import { renderStaticEntry } from "../static-editorial/render.js";

export function parseStaticPreviewArgs(
  args: readonly string[],
  projectRoot: string,
) {
  const values = new Map<string, string>();
  for (let index = 0; index < args.length; index += 2) {
    const key = args[index];
    const value = args[index + 1];
    if (!key?.startsWith("--") || !value || values.has(key))
      throw new Error("STATIC_PREVIEW_ARGUMENT_INVALID");
    values.set(key, value);
  }
  const source = values.get("--source");
  const entryId = values.get("--entry");
  const brandRoot = values.get("--brand-root");
  const output = values.get("--output");
  if (!source || !entryId || !brandRoot || !output || values.size !== 4)
    throw new Error("STATIC_PREVIEW_ARGUMENT_INVALID");
  if (!isAbsolute(source))
    throw new Error("STATIC_PREVIEW_SOURCE_ABSOLUTE_REQUIRED");
  if (extname(source) !== ".md")
    throw new Error("STATIC_PREVIEW_SOURCE_MARKDOWN_REQUIRED");
  if (!isAbsolute(brandRoot) || !isAbsolute(output))
    throw new Error("STATIC_PREVIEW_PATH_ABSOLUTE_REQUIRED");
  const root = resolve(projectRoot);
  const resolvedOutput = resolve(output);
  if (resolvedOutput === root || resolvedOutput.startsWith(`${root}${sep}`))
    throw new Error("STATIC_PREVIEW_OUTPUT_MUST_BE_PRIVATE");
  return {
    source,
    entryId,
    brandRoot: pathToFileURL(`${resolve(brandRoot)}${sep}`),
    output: resolvedOutput,
    projectRoot: root,
  };
}

export async function runStaticPreview(
  options: Readonly<{
    source: string;
    entryId: string;
    brandRoot: URL;
    output: string;
    projectRoot: string;
  }>,
): Promise<Readonly<{ htmlPath: string; mediaRevision: string }>> {
  await access(options.output).then(
    () => {
      throw new Error("STATIC_PREVIEW_OUTPUT_MUST_BE_NEW");
    },
    () => undefined,
  );
  const markdown = await readFile(resolve(options.source), "utf8");
  const entry = parseStaticBatch(markdown, "troco").entries.find(
    ({ id }) => id === options.entryId,
  );
  if (!entry) throw new Error("STATIC_PREVIEW_ENTRY_NOT_FOUND");
  const brand = await loadBrand(options.brandRoot);
  const rendered = await renderStaticEntry({
    entry,
    brand,
    output: resolve(options.output),
    rendererRevision: "troco-static-v1",
  });
  await verifyStaticAssets(rendered.assets);
  const htmlPath = await writeStaticPreview(
    options.output,
    entry.id,
    rendered.mediaRevision,
    rendered.assets,
  );
  return { htmlPath, mediaRevision: rendered.mediaRevision };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  await runStaticPreview(
    parseStaticPreviewArgs(process.argv.slice(2), process.cwd()),
  );
}
