import type { CampaignState } from "../state/schema.js";
import { isPublicationOverdue } from "./timing.js";

const channels = ["instagram", "facebook", "tiktok", "youtube"] as const;

export function assertPublisherHealthy(
  states: readonly CampaignState[],
  now = new Date(),
): void {
  const storyFailures = states.filter((state) => {
    const story = state.instagramStory;
    if (!story) return false;
    if (story.stage === "failed" || story.lastError) return true;
    const since = story.intentAt ?? state.channels.instagram.publishedAt;
    return (
      story.stage !== "published" &&
      since &&
      now.valueOf() - new Date(since).valueOf() > 6 * 60 * 60_000
    );
  });
  if (storyFailures.length) {
    throw new Error(
      `Unresolved Instagram Stories: ${storyFailures.map((state) => state.plan.id).join(", ")}`,
    );
  }
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
