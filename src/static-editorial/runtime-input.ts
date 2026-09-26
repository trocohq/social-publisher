import { Buffer } from "node:buffer";

import { z } from "zod";

import { sha256 } from "../shared/determinism.js";
import { parseStaticBatch, type CompiledStaticEntry } from "./markdown.js";

const Revision = z.string().regex(/^sha256:[a-f0-9]{64}$/u);
const RuntimeApprovalSchema = z.strictObject({
  schemaVersion: z.literal(1),
  entryId: z.string().regex(/^troco-[a-z0-9]+(?:-[a-z0-9]+)*$/u),
  contentRevision: Revision,
  mediaRevision: Revision,
  actorId: z.string().min(1),
  approvedAt: z.iso.datetime({ offset: true }),
  artifacts: z
    .array(
      z.strictObject({
        id: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/u),
        privatePath: z.string().regex(/^media\/[a-zA-Z0-9._/-]+\.jpe?g$/u),
        publicUrl: z.url(),
        sha256: Revision,
        byteLength: z.number().int().positive().max(8_000_000),
      }),
    )
    .min(1)
    .max(5),
});

export type RuntimeApproval = z.infer<typeof RuntimeApprovalSchema>;
export type ApprovedRuntimeInput = Readonly<{
  entry: CompiledStaticEntry;
  approval: RuntimeApproval;
  artifacts: readonly Readonly<{
    id: string;
    storage: "external";
    sha256: string;
    byteSize: number;
    mediaType: "image/jpeg";
    locator: string;
  }>[];
}>;

function requirePublicUrl(value: string, origin: string): string {
  const url = new URL(value);
  const expected = new URL(origin);
  if (
    url.protocol !== "https:" ||
    url.username ||
    url.password ||
    expected.protocol !== "https:" ||
    url.origin !== expected.origin ||
    !url.pathname.startsWith(`${expected.pathname.replace(/\/$/u, "")}/`)
  )
    throw new Error("STATIC_RUNTIME_PUBLIC_URL_INVALID");
  return url.toString();
}

export function compileApprovedRuntimeInput(
  input: Readonly<{
    batch: Uint8Array;
    approval: Uint8Array;
    media: ReadonlyMap<string, Uint8Array>;
    publicOrigin: string;
  }>,
): ApprovedRuntimeInput {
  let approvalValue: unknown;
  try {
    approvalValue = JSON.parse(
      new TextDecoder("utf-8", { fatal: true }).decode(input.approval),
    ) as unknown;
  } catch {
    throw new Error("STATIC_RUNTIME_APPROVAL_INVALID");
  }
  const parsed = RuntimeApprovalSchema.safeParse(approvalValue);
  if (!parsed.success) throw new Error("STATIC_RUNTIME_APPROVAL_INVALID");
  const approval = parsed.data;
  const batch = parseStaticBatch(
    new TextDecoder("utf-8", { fatal: true }).decode(input.batch),
    "troco",
  );
  const entry = batch.entries.find(
    (candidate) => candidate.id === approval.entryId,
  );
  if (!entry || entry.contentRevision !== approval.contentRevision)
    throw new Error("STATIC_RUNTIME_CONTENT_MISMATCH");
  if (entry.slides.length !== approval.artifacts.length)
    throw new Error("STATIC_RUNTIME_MEDIA_MISMATCH");
  const paths = new Set<string>();
  const ids = new Set<string>();
  const artifacts = approval.artifacts.map((artifact) => {
    if (paths.has(artifact.privatePath) || ids.has(artifact.id))
      throw new Error("STATIC_RUNTIME_MEDIA_MISMATCH");
    paths.add(artifact.privatePath);
    ids.add(artifact.id);
    const bytes = input.media.get(artifact.privatePath);
    if (
      !bytes ||
      bytes.byteLength !== artifact.byteLength ||
      `sha256:${sha256(Buffer.from(bytes))}` !== artifact.sha256
    )
      throw new Error("STATIC_RUNTIME_MEDIA_MISMATCH");
    return Object.freeze({
      id: artifact.id,
      storage: "external" as const,
      sha256: artifact.sha256.slice("sha256:".length),
      byteSize: artifact.byteLength,
      mediaType: "image/jpeg" as const,
      locator: requirePublicUrl(artifact.publicUrl, input.publicOrigin),
    });
  });
  return Object.freeze({
    entry,
    approval,
    artifacts: Object.freeze(artifacts),
  });
}
