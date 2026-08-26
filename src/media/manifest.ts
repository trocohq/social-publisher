import { z } from "zod";

import type { CampaignState } from "../state/schema.js";

const hashSchema = z.string().regex(/^[a-f0-9]{64}$/);

export const mediaAssetSchema = z
  .object({
    kind: z.enum(["feed", "video"]),
    filename: z.string(),
    hash: hashSchema,
    contentType: z.enum(["image/jpeg", "video/mp4"]),
    bytes: z.number().int().positive().max(50_000_000).optional(),
  })
  .superRefine((asset, context) => {
    const validFeed =
      asset.kind === "feed" &&
      /^slide-0[1-5]\.jpg$/.test(asset.filename) &&
      asset.contentType === "image/jpeg";
    const validVideo =
      asset.kind === "video" &&
      asset.filename === "short.mp4" &&
      asset.contentType === "video/mp4";
    if (!validFeed && !validVideo) {
      context.addIssue({
        code: "custom",
        message: "Media filename, kind, and content type do not match",
      });
    }
  });
export type MediaAsset = z.infer<typeof mediaAssetSchema>;

export const campaignMediaRecordSchema = z
  .object({
    schemaVersion: z.literal(1),
    localDate: z.iso.date(),
    campaignId: z.string().regex(/^\d{4}-\d{2}-\d{2}-[a-z0-9-]+-v\d+-\d+$/),
    assets: z.array(mediaAssetSchema).min(2).max(6),
  })
  .superRefine((record, context) => {
    if (!record.campaignId.startsWith(`${record.localDate}-`)) {
      context.addIssue({
        code: "custom",
        message: "Campaign ID must start with its local date",
        path: ["campaignId"],
      });
    }
    const names = record.assets.map(
      (asset) => `${asset.kind}/${asset.filename}`,
    );
    if (new Set(names).size !== names.length) {
      context.addIssue({
        code: "custom",
        message: "Media assets must be unique",
      });
    }
    if (!record.assets.some((asset) => asset.kind === "feed")) {
      context.addIssue({ code: "custom", message: "Feed media is required" });
    }
    if (!record.assets.some((asset) => asset.kind === "video")) {
      context.addIssue({ code: "custom", message: "Video media is required" });
    }
  });
export type CampaignMediaRecord = z.infer<typeof campaignMediaRecordSchema>;

export function mediaRecordFromState(
  state: CampaignState,
): CampaignMediaRecord {
  return campaignMediaRecordSchema.parse({
    schemaVersion: 1,
    localDate: state.plan.localDate,
    campaignId: state.plan.id,
    assets: [
      ...state.renderHashes.feed.map((hash, index) => ({
        kind: "feed" as const,
        filename: `slide-${String(index + 1).padStart(2, "0")}.jpg`,
        hash,
        contentType: "image/jpeg" as const,
      })),
      {
        kind: "video" as const,
        filename: "short.mp4",
        hash: state.renderHashes.video,
        contentType: "video/mp4" as const,
      },
    ],
  });
}
