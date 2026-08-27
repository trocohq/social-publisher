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
    if (next.channels[channel].stage !== "planned") {
      throw new Error(`Disabled ${channel} channel must begin at planned`);
    }
    next = transitionProvider(next, channel, "skipped_disabled", now);
  }
  return next;
}
