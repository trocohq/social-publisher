import {
  campaignStateSchema,
  type CampaignState,
  type PublicationChannel,
} from "./schema.js";
import { transitionProvider } from "./transitions.js";

export function migrateControlledYouTubeToBuffer(
  state: CampaignState,
  now: Date,
): CampaignState {
  if (Number.isNaN(now.valueOf())) throw new Error("Invalid migration time");
  const record = state.channels.youtube;
  if (
    record.stage !== "scheduled" ||
    !record.providerId ||
    !record.permalink?.startsWith("https://www.youtube.com/watch?") ||
    record.scheduledAt ||
    new Date(state.plan.targetAt).valueOf() <= now.valueOf()
  ) {
    throw new Error("Private YouTube verification is not eligible for migration");
  }

  const transitioned = transitionProvider(state, "youtube", "retryable", now);
  return campaignStateSchema.parse({
    ...transitioned,
    channels: {
      ...transitioned.channels,
      youtube: {
        ...transitioned.channels.youtube,
        providerId: undefined,
        permalink: undefined,
        scheduledAt: undefined,
        publishedAt: undefined,
        lastError: undefined,
      },
    },
  });
}

export function recoverFixedProviderContract(
  state: CampaignState,
  channel: PublicationChannel,
  now: Date,
): CampaignState {
  if (Number.isNaN(now.valueOf())) throw new Error("Invalid recovery time");
  const record = state.channels[channel];
  if (
    record.stage !== "failed" ||
    record.providerId ||
    record.lastError?.category !== "buffer_validation"
  ) {
    throw new Error("Provider failure is not eligible for contract recovery");
  }

  return campaignStateSchema.parse({
    ...state,
    channels: {
      ...state.channels,
      [channel]: {
        ...record,
        stage: "retryable",
        lastError: undefined,
        transitions: [
          ...record.transitions,
          {
            from: "failed",
            to: "retryable",
            at: now.toISOString(),
          },
        ],
      },
    },
  });
}
