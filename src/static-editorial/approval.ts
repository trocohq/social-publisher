import { canonicalJson } from "./revision.js";

type Revision = `sha256:${string}`;
type AssetIdentity = Readonly<{ filename: string; sha256: Revision }>;

export type OwnerApprovalRequest = Readonly<{
  actorId: string;
  authenticated: boolean;
  approvedRevision: Revision;
  approvedAt: string;
  action: "approve-static-preview";
}>;

export interface ApprovalStore {
  read(id: string, revision: string): Promise<unknown | null>;
  createExclusive(id: string, revision: string, record: unknown): Promise<void>;
}

export async function approveStaticPreview(
  input: Readonly<{
    preview: Readonly<{
      entryId: string;
      contentRevision: Revision;
      mediaRevision: Revision;
      assets: readonly AssetIdentity[];
    }>;
    currentSource: string;
    currentAssets: readonly AssetIdentity[];
    request: OwnerApprovalRequest;
    store: ApprovalStore;
  }>,
): Promise<unknown> {
  if (
    input.request.authenticated !== true ||
    input.request.action !== "approve-static-preview" ||
    !input.request.actorId.trim()
  )
    throw new Error("STATIC_APPROVAL_AUTHENTICATION_REQUIRED");
  if (
    input.request.approvedRevision !== input.preview.mediaRevision ||
    input.currentSource !== input.preview.contentRevision ||
    canonicalJson(input.currentAssets) !== canonicalJson(input.preview.assets)
  )
    throw new Error("APPROVAL_REVISION_MISMATCH");
  const existing = await input.store.read(
    input.preview.entryId,
    input.preview.mediaRevision,
  );
  if (existing !== null) return existing;
  const record = Object.freeze({
    schemaVersion: 1 as const,
    entryId: input.preview.entryId,
    contentRevision: input.preview.contentRevision,
    mediaRevision: input.preview.mediaRevision,
    assets: input.preview.assets,
    actorId: input.request.actorId,
    approvedAt: input.request.approvedAt,
  });
  await input.store.createExclusive(
    input.preview.entryId,
    input.preview.mediaRevision,
    record,
  );
  return record;
}
