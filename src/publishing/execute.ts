import type {
  NormalizedProviderObject,
  ProviderResult,
} from "../networks/types.js";
import { sanitizeError } from "../state/sanitize.js";
import {
  campaignStateSchema,
  type CampaignState,
  type PublicationChannel,
  type Stage,
} from "../state/schema.js";
import { transitionProvider } from "../state/transitions.js";

type AdapterOutcome =
  | NormalizedProviderObject
  | undefined
  | ProviderResult<NormalizedProviderObject | undefined>;

function isProviderResult(
  value: AdapterOutcome,
): value is ProviderResult<NormalizedProviderObject | undefined> {
  return Boolean(
    value &&
    typeof value === "object" &&
    "kind" in value &&
    ["success", "retryable_error", "permanent_error"].includes(value.kind),
  );
}

function unwrap(value: AdapterOutcome): NormalizedProviderObject | undefined {
  if (!isProviderResult(value)) return value;
  if (value.kind === "success") return value.value;
  throw Object.assign(new Error(value.message), {
    category: value.category,
    retryable: value.kind === "retryable_error",
    ...(value.statusCode ? { statusCode: value.statusCode } : {}),
    ...(value.retryAfterSeconds !== undefined
      ? { retryAfterSeconds: value.retryAfterSeconds }
      : {}),
  });
}

function errorIsRetryable(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const record = error as Record<string, unknown>;
  const status = Number(record.statusCode ?? record.status);
  return record.retryable === true || status === 429 || status >= 500;
}

function transitionToSuccess(
  state: CampaignState,
  channel: PublicationChannel,
  provider: NormalizedProviderObject,
  now: Date,
): CampaignState {
  const current = state.channels[channel].stage;
  let desired: Stage = provider.status;
  if (
    desired === "scheduled" &&
    provider.dueAt &&
    new Date(provider.dueAt).valueOf() <= now.valueOf()
  ) {
    desired = "publishing";
  }

  let transitioned = state;
  if (desired === "published" && current === "scheduling") {
    transitioned = transitionProvider(transitioned, channel, "publishing", now);
    transitioned = transitionProvider(transitioned, channel, "published", now);
  } else if (desired !== current) {
    transitioned = transitionProvider(transitioned, channel, desired, now);
  }

  return campaignStateSchema.parse({
    ...transitioned,
    channels: {
      ...transitioned.channels,
      [channel]: {
        ...transitioned.channels[channel],
        providerId: provider.id,
        ...(provider.permalink ? { permalink: provider.permalink } : {}),
        ...(provider.dueAt ? { scheduledAt: provider.dueAt } : {}),
        ...(desired === "published" ? { publishedAt: now.toISOString() } : {}),
        lastError: undefined,
      },
    },
  });
}

export async function executePublication({
  state,
  channel,
  reconcile,
  create,
  now,
  persist,
}: Readonly<{
  state: CampaignState;
  channel: PublicationChannel;
  reconcile: () => Promise<AdapterOutcome>;
  create: () => Promise<AdapterOutcome>;
  now: Date;
  persist?: (state: CampaignState) => Promise<void>;
}>): Promise<CampaignState> {
  const activeStage = state.channels[channel].stage;
  if (activeStage !== "scheduling" && activeStage !== "publishing") {
    throw new Error("Publication execution requires a persisted active intent");
  }

  try {
    const existing = unwrap(await reconcile());
    const provider = existing ?? unwrap(await create());
    if (!provider) throw new Error("Provider create returned no object");
    const completed = transitionToSuccess(state, channel, provider, now);
    await persist?.(completed);
    return completed;
  } catch (error) {
    const target = errorIsRetryable(error) ? "retryable" : "failed";
    const transitioned = transitionProvider(state, channel, target, now);
    const failed = campaignStateSchema.parse({
      ...transitioned,
      channels: {
        ...transitioned.channels,
        [channel]: {
          ...transitioned.channels[channel],
          lastError: sanitizeError(error),
        },
      },
    });
    await persist?.(failed);
    return failed;
  }
}
