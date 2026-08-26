import type { CampaignState } from "../state/schema.js";

const channels = ["instagram", "facebook", "tiktok", "youtube"] as const;

export function assertPublisherHealthy(states: readonly CampaignState[]): void {
  const unresolved = states.flatMap((state) =>
    channels.flatMap((channel) => {
      const stage = state.channels[channel].stage;
      return stage === "retryable" || stage === "failed"
        ? [`${state.plan.id}:${channel}:${stage}`]
        : [];
    }),
  );
  if (unresolved.length > 0) {
    throw new Error(
      `Unresolved publication failures: ${unresolved.slice(0, 10).join(", ")}`,
    );
  }
}
