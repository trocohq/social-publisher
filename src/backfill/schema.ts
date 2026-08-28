import { z } from "zod";

import { sanitizedErrorSchema, type SanitizedError } from "../state/schema.js";

export const thumbnailBackfillCampaignIdSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}-[a-z0-9-]+-v\d+-\d+$/);

const hashSchema = z.string().regex(/^[a-f0-9]{64}$/);

export const thumbnailBackfillChannelSchema = z.enum([
  "instagram",
  "facebook",
  "youtube",
]);
export type ThumbnailBackfillChannel = z.infer<
  typeof thumbnailBackfillChannelSchema
>;

export const thumbnailBackfillStatusSchema = z.enum([
  "pending",
  "updated",
  "unsupported",
  "not_found",
  "failed",
]);
export type ThumbnailBackfillStatus = z.infer<
  typeof thumbnailBackfillStatusSchema
>;

export const backfillThumbnailSchema = z
  .object({
    hash: hashSchema,
    width: z.literal(1080),
    height: z.literal(1920),
    format: z.literal("jpeg"),
  })
  .strict();
export type BackfillThumbnail = z.infer<typeof backfillThumbnailSchema>;

const channelRecordSchema = z
  .object({
    status: thumbnailBackfillStatusSchema,
    attempts: z.number().int().nonnegative(),
    bufferProviderId: z.string().min(1).max(300).optional(),
    nativeProviderId: z.string().min(1).max(300).optional(),
    permalink: z
      .url()
      .refine((value) => value.startsWith("https://"))
      .optional(),
    attemptedAt: z.iso.datetime({ offset: true }).optional(),
    verifiedAt: z.iso.datetime({ offset: true }).optional(),
    lastError: sanitizedErrorSchema.optional(),
  })
  .strict()
  .superRefine((record, context) => {
    if (record.status !== "pending" && !record.attemptedAt) {
      context.addIssue({
        code: "custom",
        message: "A completed backfill outcome requires attemptedAt",
      });
    }
    if (record.status === "updated" && !record.verifiedAt) {
      context.addIssue({
        code: "custom",
        message: "An updated cover requires verifiedAt",
      });
    }
    if (record.status === "failed" && !record.lastError) {
      context.addIssue({
        code: "custom",
        message: "A failed cover requires a sanitized error",
      });
    }
    if (record.status !== "failed" && record.lastError) {
      context.addIssue({
        code: "custom",
        message: "Only failed covers may store an error",
      });
    }
  });

export const thumbnailBackfillAuditSchema = z
  .object({
    schemaVersion: z.literal(1),
    campaignId: thumbnailBackfillCampaignIdSchema,
    thumbnail: backfillThumbnailSchema,
    channels: z
      .object({
        instagram: channelRecordSchema,
        facebook: channelRecordSchema,
        youtube: channelRecordSchema,
      })
      .strict(),
  })
  .strict()
  .superRefine((audit, context) => {
    const youtube = audit.channels.youtube;
    if (youtube.status === "updated" && !youtube.nativeProviderId) {
      context.addIssue({
        code: "custom",
        message: "An updated YouTube cover requires its native video ID",
        path: ["channels", "youtube", "nativeProviderId"],
      });
    }
  });
export type ThumbnailBackfillAudit = z.infer<
  typeof thumbnailBackfillAuditSchema
>;

type BufferProviderIds = Readonly<
  Partial<Record<ThumbnailBackfillChannel, string>>
>;

export function createThumbnailBackfillAudit({
  campaignId,
  thumbnail,
  bufferProviderIds,
}: Readonly<{
  campaignId: string;
  thumbnail: BackfillThumbnail;
  bufferProviderIds: BufferProviderIds;
}>): ThumbnailBackfillAudit {
  const pending = (channel: ThumbnailBackfillChannel) => ({
    status: "pending" as const,
    attempts: 0,
    ...(bufferProviderIds[channel]
      ? { bufferProviderId: bufferProviderIds[channel] }
      : {}),
  });

  return thumbnailBackfillAuditSchema.parse({
    schemaVersion: 1,
    campaignId,
    thumbnail,
    channels: {
      instagram: pending("instagram"),
      facebook: pending("facebook"),
      youtube: pending("youtube"),
    },
  });
}

export function assertMatchingThumbnail(
  audit: ThumbnailBackfillAudit,
  thumbnail: BackfillThumbnail,
): void {
  if (audit.thumbnail.hash !== thumbnail.hash) {
    throw new Error("Published thumbnail hash changed after audit creation");
  }
}

export type ThumbnailBackfillOutcome =
  | Readonly<{
      status: "updated";
      nativeProviderId?: string;
      permalink?: string;
    }>
  | Readonly<{ status: "unsupported" | "not_found" }>
  | Readonly<{ status: "failed"; lastError: SanitizedError }>;

export function recordThumbnailBackfillOutcome({
  audit,
  channel,
  outcome,
  now,
}: Readonly<{
  audit: ThumbnailBackfillAudit;
  channel: ThumbnailBackfillChannel;
  outcome: ThumbnailBackfillOutcome;
  now: Date;
}>): ThumbnailBackfillAudit {
  if (Number.isNaN(now.valueOf())) throw new Error("Invalid backfill clock");
  const current = audit.channels[channel];
  if (current.status === "updated") {
    throw new Error(`Thumbnail already updated for ${channel}`);
  }
  const stable = {
    attempts: current.attempts,
    ...(current.bufferProviderId
      ? { bufferProviderId: current.bufferProviderId }
      : {}),
  };
  const next = {
    ...stable,
    status: outcome.status,
    attempts: current.attempts + 1,
    attemptedAt: now.toISOString(),
    ...(outcome.status === "updated"
      ? {
          verifiedAt: now.toISOString(),
          ...(outcome.nativeProviderId
            ? { nativeProviderId: outcome.nativeProviderId }
            : {}),
          ...(outcome.permalink ? { permalink: outcome.permalink } : {}),
        }
      : {}),
    ...(outcome.status === "failed" ? { lastError: outcome.lastError } : {}),
  };

  return thumbnailBackfillAuditSchema.parse({
    ...audit,
    channels: { ...audit.channels, [channel]: next },
  });
}
