import { localDateAt } from "../shared/time.js";
import type { CampaignState, PublicationChannel } from "../state/schema.js";
import { transitionProvider } from "../state/transitions.js";

const channels = [
  "instagram",
  "facebook",
  "tiktok",
  "youtube",
] as const satisfies readonly PublicationChannel[];

export async function expireRetryablePublications({
  states,
  now,
  persist,
}: Readonly<{
  states: readonly CampaignState[];
  now: Date;
  persist?: (state: CampaignState) => Promise<void>;
}>): Promise<readonly CampaignState[]> {
  const today = localDateAt(now);
  const results: CampaignState[] = [];
  for (const state of states) {
    let next = state;
    if (state.plan.localDate < today) {
      for (const channel of channels) {
        if (next.channels[channel].stage === "retryable") {
          next = transitionProvider(next, channel, "skipped_expired", now);
        }
      }
    }
    if (next !== state) await persist?.(next);
    results.push(next);
  }
  return Object.freeze(results);
}
