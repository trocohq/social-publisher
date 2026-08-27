import {
  publicationChannels,
  type ChannelEnablement,
} from "../config/channels.js";
import type { CampaignState } from "./schema.js";
import { transitionProvider } from "./transitions.js";

export function markDisabledChannels(
  state: CampaignState,
  enabled: ChannelEnablement,
  now: Date,
): CampaignState {
  let next = state;
  for (const channel of publicationChannels) {
    if (enabled[channel]) continue;
    if (next.channels[channel].stage === "skipped_disabled") continue;
    if (
      !["planned", "rendered", "deploying", "media_verified"].includes(
        next.channels[channel].stage,
      )
    )
      continue;
    next = transitionProvider(next, channel, "skipped_disabled", now);
  }
  return next;
}
