import {
  campaignStateSchema,
  type CampaignState,
  type PublicationChannel,
  type Stage,
  type StageRecord,
} from "./schema.js";

const providerTransitions: Readonly<Record<Stage, readonly Stage[]>> = {
  planned: [
    "rendered",
    "retryable",
    "failed",
    "skipped_disabled",
    "skipped_expired",
  ],
  rendered: [
    "deploying",
    "retryable",
    "failed",
    "skipped_disabled",
    "skipped_expired",
  ],
  deploying: [
    "media_verified",
    "retryable",
    "failed",
    "skipped_disabled",
    "skipped_expired",
  ],
  media_verified: [
    "scheduling",
    "publishing",
    "skipped_disabled",
    "skipped_expired",
  ],
  scheduling: ["scheduled", "publishing", "retryable", "failed"],
  scheduled: ["publishing", "published", "retryable", "failed"],
  publishing: ["published", "retryable", "failed"],
  retryable: ["scheduling", "publishing", "skipped_expired"],
  published: [],
  failed: [],
  skipped_disabled: [],
  skipped_expired: [],
};

const mediaTransitions: Readonly<Record<Stage, readonly Stage[]>> = {
  planned: ["rendered", "retryable", "failed"],
  rendered: ["deploying", "retryable", "failed"],
  deploying: ["media_verified", "retryable", "failed"],
  retryable: ["rendered", "deploying"],
  media_verified: [],
  scheduling: [],
  scheduled: [],
  publishing: [],
  published: [],
  failed: [],
  skipped_disabled: [],
  skipped_expired: [],
};

function transitionRecord(
  record: StageRecord,
  to: Stage,
  now: Date,
  graph: Readonly<Record<Stage, readonly Stage[]>>,
): StageRecord {
  if (Number.isNaN(now.valueOf())) throw new Error("Invalid transition time");
  if (!graph[record.stage].includes(to)) {
    throw new Error(`Illegal transition from ${record.stage} to ${to}`);
  }
  return {
    ...record,
    stage: to,
    transitions: [
      ...record.transitions,
      { from: record.stage, to, at: now.toISOString() },
    ],
  };
}

export function transitionProvider(
  state: CampaignState,
  channel: PublicationChannel,
  to: Stage,
  now: Date,
): CampaignState {
  return campaignStateSchema.parse({
    ...state,
    channels: {
      ...state.channels,
      [channel]: transitionRecord(
        state.channels[channel],
        to,
        now,
        providerTransitions,
      ),
    },
  });
}

export function transitionMedia(
  state: CampaignState,
  to: Stage,
  now: Date,
): CampaignState {
  return campaignStateSchema.parse({
    ...state,
    media: transitionRecord(state.media, to, now, mediaTransitions),
  });
}
