import { z } from "zod";

const Revision = z.string().regex(/^sha256:[a-f0-9]{64}$/u);
const Attempt = z.strictObject({
  envelopeSha256: Revision,
  attemptedAt: z.iso.datetime({ offset: true }),
  outcome: z.enum([
    "accepted",
    "scheduled",
    "processing",
    "uncertain",
    "published",
    "failed",
  ]),
  platformId: z.string().min(1).optional(),
  providerId: z.string().min(1).optional(),
});
const History = z.strictObject({
  publishAt: z.string(),
  heldReason: z.string().min(1).optional(),
});
const StaticRecordSchema = z.strictObject({
  schemaVersion: z.literal(1),
  logicalKey: z.string().min(1),
  id: z.string().regex(/^troco-/u),
  brand: z.literal("troco"),
  channel: z.enum(["instagram", "facebook"]),
  placement: z.enum(["feed", "story"]),
  owner: z.string().min(1),
  fence: z.number().int().nonnegative(),
  approvalRevision: Revision,
  publishAt: z.string(),
  state: z.enum([
    "approved",
    "held",
    "intent",
    "accepted",
    "scheduled",
    "processing",
    "uncertain",
    "published",
    "failed",
  ]),
  heldReason: z.string().min(1).optional(),
  attempts: z.array(Attempt),
  history: z.array(History),
});

export type StaticRecord = z.infer<typeof StaticRecordSchema>;
export function defineStaticRecord(input: unknown): StaticRecord {
  return StaticRecordSchema.parse(input);
}

export function rescheduleHeld(
  record: StaticRecord,
  approval: Readonly<{
    approvalRevision: `sha256:${string}`;
    publishAt: string;
    approvedAt: string;
  }>,
  now: Date,
): StaticRecord {
  if (
    record.state !== "held" ||
    record.attempts.length > 0 ||
    approval.approvalRevision === record.approvalRevision ||
    Date.parse(approval.publishAt) <= now.valueOf() ||
    !Number.isFinite(Date.parse(approval.approvedAt))
  )
    throw new Error("STATIC_RESCHEDULE_INVALID");
  return defineStaticRecord({
    ...record,
    approvalRevision: approval.approvalRevision,
    publishAt: approval.publishAt,
    state: "approved",
    heldReason: undefined,
    history: [
      ...record.history,
      {
        publishAt: record.publishAt,
        ...(record.heldReason ? { heldReason: record.heldReason } : {}),
      },
    ],
  });
}
