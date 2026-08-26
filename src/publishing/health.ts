import type { CampaignState } from "../state/schema.js";
import { isPublicationOverdue } from "./timing.js";

const channels = ["instagram", "facebook", "tiktok", "youtube"] as const;

export function assertPublisherHealthy(
  states: readonly CampaignState[],
  now = new Date(),
): void {
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
  const overdue = states.flatMap((state) =>
    channels.flatMap((channel) =>
      isPublicationOverdue(state, channel, now)
        ? [`${state.plan.id}:${channel}:${state.channels[channel].stage}`]
        : [],
    ),
  );
  if (overdue.length > 0) {
    throw new Error(`Overdue publications: ${overdue.slice(0, 10).join(", ")}`);
  }
}
