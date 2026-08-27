import {
  campaignStateSchema,
  type CampaignState,
  type PublicationChannel,
} from "./schema.js";

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
