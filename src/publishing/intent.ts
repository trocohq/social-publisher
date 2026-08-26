import { campaignStateSchema, type CampaignState } from "../state/schema.js";
import { writeCampaignState } from "../state/storage.js";
import { transitionProvider } from "../state/transitions.js";
import type { PublicationAction } from "./next-action.js";

export function createPublicationIntent(
  state: CampaignState,
  action: PublicationAction,
  now: Date,
): CampaignState {
  if (
    state.plan.id !== action.campaignId ||
    state.plan.localDate !== action.localDate
  ) {
    throw new Error("Publication action does not match campaign state");
  }
  const transitioned = transitionProvider(
    state,
    action.channel,
    action.phase,
    now,
  );
  return campaignStateSchema.parse({
    ...transitioned,
    channels: {
      ...transitioned.channels,
      [action.channel]: {
        ...transitioned.channels[action.channel],
        attempts: transitioned.channels[action.channel].attempts + 1,
        lastError: undefined,
      },
    },
  });
}

export async function persistPublicationIntent({
  state,
  action,
  now,
  stateRoot,
}: Readonly<{
  state: CampaignState;
  action: PublicationAction;
  now: Date;
  stateRoot: string;
}>): Promise<CampaignState> {
  const intended = createPublicationIntent(state, action, now);
  await writeCampaignState(stateRoot, intended);
  return intended;
}
