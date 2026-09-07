import { z } from "zod";

import { campaignPlanSchema } from "../editorial/schema.js";

export const stageSchema = z.enum([
  "planned",
  "rendered",
  "deploying",
  "media_verified",
  "scheduling",
  "scheduled",
  "publishing",
  "published",
  "retryable",
  "failed",
  "skipped_disabled",
  "skipped_expired",
]);
export type Stage = z.infer<typeof stageSchema>;

export const sanitizedErrorSchema = z.object({
  category: z
    .string()
    .regex(/^[a-z0-9_]+$/)
    .max(80),
  message: z.string().min(1).max(500),
  statusCode: z.number().int().min(100).max(599).optional(),
  retryAfterSeconds: z.number().int().nonnegative().max(86_400).optional(),
});
export type SanitizedError = z.infer<typeof sanitizedErrorSchema>;

export const transitionRecordSchema = z.object({
  from: stageSchema,
  to: stageSchema,
  at: z.iso.datetime({ offset: true }),
});
export type TransitionRecord = z.infer<typeof transitionRecordSchema>;

export const stageRecordSchema = z.object({
  stage: stageSchema,
  attempts: z.number().int().nonnegative(),
  transitions: z.array(transitionRecordSchema),
  providerId: z.string().min(1).max(300).optional(),
  permalink: z
    .url()
    .refine((value) => value.startsWith("https://"))
    .optional(),
  scheduledAt: z.iso.datetime({ offset: true }).optional(),
  publishedAt: z.iso.datetime({ offset: true }).optional(),
  lastError: sanitizedErrorSchema.optional(),
});
export type StageRecord = z.infer<typeof stageRecordSchema>;

const commitSchema = z.string().regex(/^[a-f0-9]{40}$/);
const hashSchema = z.string().regex(/^[a-f0-9]{64}$/);

export const platformMediaSchema = z.object({
  schemaVersion: z.literal(1),
  approvalSha256: hashSchema,
  assets: z.array(z.object({
    sha256: hashSchema,
    byteSize: z.number().int().positive().max(50_000_000),
  }).strict()).min(1).max(6),
}).strict();

export const campaignStateSchema = z.object({
  schemaVersion: z.literal(1),
  plan: campaignPlanSchema,
  sourceCommits: z.object({
    brand: commitSchema,
    designTokens: commitSchema,
  }),
  renderHashes: z.object({
    feed: z.array(hashSchema).min(1).max(5),
    video: hashSchema,
  }),
  platformMedia: platformMediaSchema.optional(),
  platformShadow: z.object({
    acknowledgedEnvelopeSha256: hashSchema.optional(),
    lastAttemptAt: z.iso.datetime({ offset: true }).optional(),
  }).strict().optional(),
  media: stageRecordSchema,
  channels: z.object({
    instagram: stageRecordSchema,
    facebook: stageRecordSchema,
    tiktok: stageRecordSchema,
    youtube: stageRecordSchema,
  }),
});
export type CampaignState = z.infer<typeof campaignStateSchema>;
export type PublicationChannel = keyof CampaignState["channels"];

export const stateIndexSchema = z.object({
  schemaVersion: z.literal(1),
  campaigns: z
    .array(z.iso.date())
    .refine(
      (values) => new Set(values).size === values.length,
      "Campaign dates must be unique",
    ),
});
export type StateIndex = z.infer<typeof stateIndexSchema>;
