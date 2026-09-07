import { createHash } from "node:crypto";
import { submitPlatformShadow } from "./platform-bridge.js";
import { checkpointMedia } from "./platform-media.js";
import { toPlatformShadowEnvelope } from "./platform-envelope.js";
import type { CampaignState } from "../state/schema.js";
import {
  listCampaignStateDates,
  readCampaignState,
  writeCampaignState,
} from "../state/storage.js";

export function platformEnvelopeSha256(state: CampaignState): string {
  const envelope = toPlatformShadowEnvelope({
    state,
    media: checkpointMedia(state),
  });
  return createHash("sha256").update(JSON.stringify(envelope)).digest("hex");
}

export function acknowledgePlatformShadow(state: CampaignState): CampaignState {
  const digest = platformEnvelopeSha256(state);
  const acknowledged = state.platformShadow?.acknowledgedEnvelopeSha256;
  if (acknowledged && acknowledged !== digest)
    throw new Error("PUBLISHING_SHADOW_ACKNOWLEDGEMENT_INVALID");
  return {
    ...state,
    platformShadow: {
      ...state.platformShadow,
      acknowledgedEnvelopeSha256: digest,
    },
  };
}

export async function recoverPlatformShadows(
  input: Readonly<{
    stateRoot: string;
    renderRoot: string;
    outboxDirectory: string;
    environment: Readonly<Record<string, string | undefined>>;
    now: Date;
    fetchImplementation?: typeof fetch;
    campaignId?: string;
  }>,
) {
  if (input.environment.PUBLISHING_SHADOW_ENABLED !== "true")
    return {
      outcome: "disabled" as const,
      attempted: 0,
      recovered: 0,
      invalid: 0,
    };
  if (Number.isNaN(input.now.valueOf()))
    throw new Error("PUBLISHING_SHADOW_RECOVERY_CLOCK_INVALID");
  const candidates: CampaignState[] = [];
  let invalid = 0;
  const dates = await listCampaignStateDates(input.stateRoot);
  if (dates.length > 1000)
    throw new Error("PUBLISHING_SHADOW_RECOVERY_INDEX_LIMIT");
  for (const date of dates) {
    if (input.campaignId && date !== input.campaignId.slice(0, 10)) continue;
    try {
      const state = await readCampaignState(input.stateRoot, date);
      if (input.campaignId && state.plan.id !== input.campaignId)
        throw new Error("PUBLISHING_SHADOW_RECOVERY_CAMPAIGN_MISMATCH");
      if (!state.platformMedia) continue;
      const digest = platformEnvelopeSha256(state);
      const acknowledged = state.platformShadow?.acknowledgedEnvelopeSha256;
      if (acknowledged && acknowledged !== digest)
        throw new Error("PUBLISHING_SHADOW_ACKNOWLEDGEMENT_INVALID");
      if (!acknowledged) candidates.push(state);
    } catch {
      invalid++;
    }
  }
  candidates.sort(
    (left, right) =>
      (left.platformShadow?.lastAttemptAt ?? "").localeCompare(
        right.platformShadow?.lastAttemptAt ?? "",
      ) || left.plan.localDate.localeCompare(right.plan.localDate),
  );
  let attempted = 0;
  let recovered = 0;
  let blocked = false;
  for (const state of candidates.slice(0, 3)) {
    attempted++;
    const attemptedState = {
      ...state,
      platformShadow: {
        ...state.platformShadow,
        lastAttemptAt: input.now.toISOString(),
      },
    };
    await writeCampaignState(input.stateRoot, attemptedState);
    let result;
    try {
      result = await submitPlatformShadow({ ...input, state: attemptedState });
    } catch (error) {
      if (
        error instanceof Error &&
        error.message ===
          "Platform shadow failed (PUBLISHING_SHADOW_MEDIA_INVALID)"
      )
        continue;
      blocked = true;
      break;
    }
    if (result.outcome === "retry-later") {
      blocked = true;
      break;
    }
    if (
      result.outcome === "accepted" ||
      result.outcome === "already-accepted"
    ) {
      await writeCampaignState(
        input.stateRoot,
        acknowledgePlatformShadow(attemptedState),
      );
      recovered++;
    }
  }
  return {
    outcome:
      recovered === candidates.length && invalid === 0
        ? ("accepted" as const)
        : blocked
          ? ("retry-later" as const)
          : ("pending" as const),
    attempted,
    recovered,
    invalid,
  };
}
