import type { CampaignState, PublicationChannel } from "../state/schema.js";

export const PUBLICATION_SETTLEMENT_GRACE_MS = 30 * 60_000;

export function isPublicationOverdue(
  state: CampaignState,
  channel: PublicationChannel,
  now: Date,
): boolean {
  if (Number.isNaN(now.valueOf())) throw new Error("Invalid publication clock");
  const record = state.channels[channel];
  if (!["scheduling", "scheduled", "publishing"].includes(record.stage)) {
    return false;
  }
  const dueAt = new Date(record.scheduledAt ?? state.plan.targetAt).valueOf();
  return (
    Number.isFinite(dueAt) &&
    dueAt + PUBLICATION_SETTLEMENT_GRACE_MS <= now.valueOf()
  );
}
