import { z } from "zod";
import {
  campaignStateSchema,
  type CampaignState,
  type PublicationChannel,
} from "../state/schema.js";
import type { AdapterOutcome } from "./execute.js";

const providerObservationSchema = z
  .object({
    id: z.string().min(1).max(300),
    status: z.enum(["scheduled", "publishing", "published"]),
    dueAt: z.iso.datetime({ offset: true }).optional(),
    permalink: z
      .url()
      .refine((value) => value.startsWith("https://"))
      .optional(),
  })
  .strict();
const observationResultSchema = z.union([
  providerObservationSchema,
  z
    .object({ kind: z.literal("success"), value: providerObservationSchema })
    .strict(),
]);

export async function reconcileFailedBufferPublication(
  input: Readonly<{
    state: CampaignState;
    channel: PublicationChannel;
    bufferChannelId: string | undefined;
    reconcile: () => Promise<AdapterOutcome>;
    now: Date;
    persist: (state: CampaignState) => Promise<void>;
  }>,
): Promise<Readonly<{ state: CampaignState; matched: boolean }>> {
  const unchanged = { state: input.state, matched: false };
  const { channel, persist, reconcile } = input;
  const parsed = campaignStateSchema.safeParse(input.state);
  if (
    !parsed.success ||
    !z.date().safeParse(input.now).success ||
    !z.enum(["instagram", "facebook", "youtube"]).safeParse(channel).success ||
    !z.string().trim().min(1).safeParse(input.bufferChannelId).success
  )
    return unchanged;
  const state = parsed.data;
  const record = state.channels[channel];
  if (
    record.stage !== "failed" ||
    !record.providerId?.trim() ||
    record.lastError?.category !== "buffer_async_failure"
  )
    return unchanged;
  const at = input.now.toISOString();
  let observed;
  try {
    observed = observationResultSchema.safeParse(await reconcile());
  } catch {
    return unchanged;
  }
  if (!observed.success) return unchanged;
  const provider =
    "kind" in observed.data ? observed.data.value : observed.data;
  if (
    provider.id !== record.providerId ||
    (provider.status === "scheduled" &&
      (!provider.dueAt || Date.parse(provider.dueAt) <= Date.parse(at)))
  )
    return unchanged;

  // Recovery is a separate, evidence-backed transition; the normal failed state remains terminal.
  const { lastError: _resolvedError, ...preserved } = record;
  const recovered = campaignStateSchema.parse({
    ...state,
    channels: {
      ...state.channels,
      [channel]: {
        ...preserved,
        stage: provider.status,
        transitions: [
          ...record.transitions,
          { from: "failed", to: provider.status, at },
        ],
        ...(provider.dueAt ? { scheduledAt: provider.dueAt } : {}),
        ...(provider.permalink ? { permalink: provider.permalink } : {}),
        ...(provider.status === "published"
          ? { publishedAt: record.publishedAt ?? at }
          : {}),
      },
    },
  });
  await persist(recovered);
  return { state: recovered, matched: true };
}
