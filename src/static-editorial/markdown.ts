import { Buffer } from "node:buffer";

import { isAlias, parseDocument, visit } from "yaml";

import { canonicalJson, sha256 } from "./revision.js";
import {
  StaticEditorialEntrySchema,
  type StaticEditorialEntry,
} from "./schema.js";

const MAX_BATCH_BYTES = 256 * 1024;
const MAX_ENTRIES = 100;
const ENTRY_PATTERN = /```editorial-yaml\r?\n([\s\S]*?)\r?\n```/gu;

export type CompiledStaticEntry = StaticEditorialEntry &
  Readonly<{
    entrySourceSha256: `sha256:${string}`;
    contentRevision: `sha256:${string}`;
  }>;

function parseEntry(source: string): StaticEditorialEntry {
  const document = parseDocument(source, { uniqueKeys: true });
  let hasAlias = false;
  visit(document, (_key, node) => {
    if (isAlias(node)) hasAlias = true;
  });
  if (document.errors.length > 0 || hasAlias) {
    throw new Error("STATIC_EDITORIAL_YAML_INVALID");
  }
  return StaticEditorialEntrySchema.parse(document.toJS({ maxAliasCount: 0 }));
}

function assertOutsideBlocksIsTitleOnly(markdown: string): void {
  const remainder = markdown.replace(ENTRY_PATTERN, "");
  for (const line of remainder.split(/\r?\n/u)) {
    if (line.trim() !== "" && !/^#{1,6} [^<>`{}]+$/u.test(line)) {
      throw new Error("STATIC_EDITORIAL_PROSE_INVALID");
    }
  }
}

export function assertUniqueStaticIds(
  entries: readonly CompiledStaticEntry[],
): void {
  const ids = new Set<string>();
  for (const entry of entries) {
    if (ids.has(entry.id))
      throw new Error(`STATIC_EDITORIAL_DUPLICATE_ID:${entry.id}`);
    ids.add(entry.id);
  }
}

export function parseStaticBatch(
  markdown: string,
  expectedBrand: "troco",
): Readonly<{ entries: readonly CompiledStaticEntry[] }> {
  if (expectedBrand !== "troco")
    throw new Error("STATIC_EDITORIAL_BRAND_INVALID");
  if (Buffer.byteLength(markdown, "utf8") > MAX_BATCH_BYTES) {
    throw new Error("STATIC_EDITORIAL_BATCH_TOO_LARGE");
  }
  assertOutsideBlocksIsTitleOnly(markdown);
  const blocks = [...markdown.matchAll(ENTRY_PATTERN)].map(
    (match) => match[1]!,
  );
  if (blocks.length === 0 || blocks.length > MAX_ENTRIES) {
    throw new Error("STATIC_EDITORIAL_ENTRY_COUNT_INVALID");
  }
  const entries = blocks.map((block) => {
    const normalizedSource = block.replaceAll("\r\n", "\n");
    const entry = parseEntry(normalizedSource);
    const entrySourceSha256 = sha256(normalizedSource);
    return {
      ...entry,
      entrySourceSha256,
      contentRevision: sha256(canonicalJson({ entry, entrySourceSha256 })),
    } satisfies CompiledStaticEntry;
  });
  assertUniqueStaticIds(entries);
  return { entries };
}
