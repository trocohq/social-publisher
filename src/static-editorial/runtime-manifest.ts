import { z } from "zod";

import { loadPrivateStaticInput } from "./private-input.js";
import {
  compileApprovedRuntimeInput,
  type ApprovedRuntimeInput,
} from "./runtime-input.js";

const BatchPath = z.string().regex(/^batches\/[a-zA-Z0-9._-]+\.md$/u);
const ApprovalPath = z.string().regex(/^approvals\/[a-zA-Z0-9._-]+\.json$/u);
const MediaPath = z.string().regex(/^media\/[a-zA-Z0-9._/-]+\.jpe?g$/u);
const ActivationSchema = z.strictObject({
  schemaVersion: z.literal(1),
  items: z
    .array(
      z.strictObject({
        batchPath: BatchPath,
        approvalPath: ApprovalPath,
        mediaPaths: z.array(MediaPath).min(1).max(5),
      }),
    )
    .min(1)
    .max(20),
});

type Transport = Parameters<typeof loadPrivateStaticInput>[0]["transport"];

export async function loadApprovedRuntimeManifest(
  input: Readonly<{
    repository: string;
    repositoryId: number;
    ref: string;
    manifestPath: string;
    publicOrigin: string;
    transport: Transport;
    maxTotalBytes?: number;
  }>,
): Promise<readonly ApprovedRuntimeInput[]> {
  if (!ApprovalPath.safeParse(input.manifestPath).success)
    throw new Error("STATIC_RUNTIME_MANIFEST_PATH_INVALID");
  const identity = {
    repository: input.repository,
    repositoryId: input.repositoryId,
    ref: input.ref,
  };
  const manifestInput = await loadPrivateStaticInput({
    config: {
      ...identity,
      paths: [input.manifestPath],
      maxTotalBytes: 128 * 1024,
    },
    transport: input.transport,
  });
  let manifestValue: unknown;
  try {
    manifestValue = JSON.parse(
      new TextDecoder("utf-8", { fatal: true }).decode(
        manifestInput.files[0]!.bytes,
      ),
    ) as unknown;
  } catch {
    throw new Error("STATIC_RUNTIME_MANIFEST_INVALID");
  }
  const parsed = ActivationSchema.safeParse(manifestValue);
  if (!parsed.success) throw new Error("STATIC_RUNTIME_MANIFEST_INVALID");
  const paths = parsed.data.items.flatMap((item) => [
    item.batchPath,
    item.approvalPath,
    ...item.mediaPaths,
  ]);
  if (new Set(paths).size !== paths.length)
    throw new Error("STATIC_RUNTIME_MANIFEST_DUPLICATE_PATH");
  const loaded = await loadPrivateStaticInput({
    config: {
      ...identity,
      paths,
      maxTotalBytes: input.maxTotalBytes ?? 120 * 1024 * 1024,
    },
    transport: input.transport,
  });
  const files = new Map(loaded.files.map((file) => [file.path, file.bytes]));
  const ids = new Set<string>();
  return Object.freeze(
    parsed.data.items.map((item) => {
      const batch = files.get(item.batchPath);
      const approval = files.get(item.approvalPath);
      if (!batch || !approval) throw new Error("STATIC_RUNTIME_FILE_MISSING");
      const compiled = compileApprovedRuntimeInput({
        batch,
        approval,
        media: new Map(
          item.mediaPaths.map((path) => {
            const bytes = files.get(path);
            if (!bytes) throw new Error("STATIC_RUNTIME_FILE_MISSING");
            return [path, bytes];
          }),
        ),
        publicOrigin: input.publicOrigin,
      });
      if (ids.has(compiled.entry.id))
        throw new Error("STATIC_RUNTIME_DUPLICATE_ID");
      ids.add(compiled.entry.id);
      return compiled;
    }),
  );
}
