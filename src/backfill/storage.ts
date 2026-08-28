import { randomUUID } from "node:crypto";
import { mkdir, open, readFile, rename } from "node:fs/promises";
import { join } from "node:path";

import {
  thumbnailBackfillAuditSchema,
  thumbnailBackfillCampaignIdSchema,
  type ThumbnailBackfillAudit,
} from "./schema.js";

function auditPath(root: string, campaignId: string): string {
  const parsed = thumbnailBackfillCampaignIdSchema.parse(campaignId);
  return join(root, "thumbnail-backfills", `${parsed}.json`);
}

export async function readThumbnailBackfill(
  root: string,
  campaignId: string,
): Promise<ThumbnailBackfillAudit | undefined> {
  try {
    return thumbnailBackfillAuditSchema.parse(
      JSON.parse(await readFile(auditPath(root, campaignId), "utf8")),
    );
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return undefined;
    throw error;
  }
}

export async function writeThumbnailBackfill(
  root: string,
  input: ThumbnailBackfillAudit,
): Promise<void> {
  const audit = thumbnailBackfillAuditSchema.parse(input);
  const directory = join(root, "thumbnail-backfills");
  await mkdir(directory, { recursive: true });
  const target = auditPath(root, audit.campaignId);
  const temporary = `${target}.${process.pid}.${randomUUID()}.tmp`;
  const handle = await open(temporary, "wx", 0o600);
  try {
    await handle.writeFile(`${JSON.stringify(audit, null, 2)}\n`, "utf8");
    await handle.sync();
  } finally {
    await handle.close();
  }
  await rename(temporary, target);
}
