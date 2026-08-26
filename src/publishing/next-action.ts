import { localDateAt } from "../shared/time.js";
import type { CampaignState, PublicationChannel } from "../state/schema.js";

const channelOrder = [
  "instagram",
  "facebook",
  "tiktok",
  "youtube",
] as const satisfies readonly PublicationChannel[];

export type PublicationAction = Readonly<{
  campaignId: string;
  localDate: string;
  channel: PublicationChannel;
  phase: "scheduling" | "publishing";
}>;

export function nextPublicationAction(
  states: readonly CampaignState[],
  now: Date,
): PublicationAction | undefined {
  if (Number.isNaN(now.valueOf())) throw new Error("Invalid publication clock");
  const today = localDateAt(now);
  const eligible = [...states]
    .filter(
      (state) =>
        state.plan.localDate >= today && state.media.stage === "media_verified",
    )
    .sort((left, right) =>
      left.plan.localDate.localeCompare(right.plan.localDate),
    );

  for (const state of eligible) {
    for (const channel of channelOrder) {
      const stage = state.channels[channel].stage;
      if (stage !== "media_verified" && stage !== "retryable") continue;
      const dueTime = new Date(state.plan.targetAt).valueOf();
      return Object.freeze({
        campaignId: state.plan.id,
        localDate: state.plan.localDate,
        channel,
        phase: dueTime > now.valueOf() ? "scheduling" : "publishing",
      });
    }
  }
  return undefined;
}
