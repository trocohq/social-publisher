import type { StaticExecutionPlan } from "../cli/execute-static-editorial.js";
import type { ApprovedStaticTarget, PendingStaticIntent } from "./cycle.js";
import { toStaticEnvelope } from "./envelope.js";
import { executeStaticIntentWithCas, type StaticIntent } from "./executor.js";
import type { ApprovedRuntimeInput } from "./runtime-input.js";
import { canonicalJson, sha256 } from "./revision.js";
import { selectStaticAction } from "./selection.js";
import type { StaticStore } from "./store.js";

type Channel = "instagram" | "facebook";
type Target = Readonly<{
  opaqueId: string;
  channel: Channel;
  deliveryId: string;
  accountChannelKey: string;
  input: ApprovedRuntimeInput;
  intent: StaticIntent;
}>;

type ProviderReconciliation = Readonly<
  | { kind: "missing" }
  | {
      kind: "found";
      providerId: string;
      status: "scheduled" | "processing" | "published";
    }
>;

function providerId(value: unknown): string | undefined {
  if (typeof value !== "object" || value === null || Array.isArray(value))
    return undefined;
  const candidate = (value as Record<string, unknown>).providerId;
  return typeof candidate === "string" && candidate ? candidate : undefined;
}

export function createStaticProductionRuntime(
  input: Readonly<{
    now(): Date;
    loadManifest(
      plan: StaticExecutionPlan,
    ): Promise<readonly ApprovedRuntimeInput[]>;
    store: StaticStore;
    expectedAccountIds: Readonly<Record<Channel, string>>;
    preflight(
      target: Readonly<{ channel: Channel; accountId: string }>,
    ): Promise<void>;
    verifyPublic(input: ApprovedRuntimeInput): Promise<void>;
    create(target: Target): Promise<Readonly<{ providerId: string }>>;
    reconcile(
      target: Target,
      providerId?: string,
    ): Promise<ProviderReconciliation>;
  }>,
) {
  let targets: readonly Target[] | undefined;

  async function load(plan: StaticExecutionPlan): Promise<readonly Target[]> {
    if (targets) return targets;
    const manifest = await input.loadManifest(plan);
    const built: Target[] = [];
    for (const approved of manifest) {
      const envelope = toStaticEnvelope({
        entry: approved.entry,
        approvalRevision: approved.approval.mediaRevision as `sha256:${string}`,
        intentGeneration: 1,
        artifacts: approved.artifacts,
        expectedAccountIds: input.expectedAccountIds,
      });
      for (const channelTarget of approved.entry.channels) {
        const channel = channelTarget.channel;
        const logicalKey = `${approved.entry.brand}:${approved.entry.id}:${channel}`;
        const intent: StaticIntent = {
          logicalKey,
          fence: 1,
          envelopeSha256: sha256(canonicalJson(envelope)),
          envelope,
        };
        built.push({
          opaqueId: logicalKey,
          channel,
          deliveryId: `${channel}-feed`,
          accountChannelKey: `${channel}:${input.expectedAccountIds[channel]}`,
          input: approved,
          intent,
        });
      }
    }
    if (new Set(built.map((target) => target.opaqueId)).size !== built.length)
      throw new Error("STATIC_RUNTIME_DUPLICATE_TARGET");
    targets = Object.freeze(built);
    return targets;
  }

  function find(opaqueId: string): Target {
    const target = targets?.find(
      (candidate) => candidate.opaqueId === opaqueId,
    );
    if (!target) throw new Error("STATIC_RUNTIME_TARGET_UNKNOWN");
    return target;
  }

  async function execute(target: Target) {
    return executeStaticIntentWithCas({
      intent: target.intent,
      store: input.store,
      transport: {
        create: async () => {
          await input.preflight({
            channel: target.channel,
            accountId: input.expectedAccountIds[target.channel],
          });
          await input.verifyPublic(target.input);
          const result = await input.create(target);
          return { kind: "accepted" as const, providerId: result.providerId };
        },
        reconcile: async (intent) => {
          const stored = await input.store.read(intent.logicalKey);
          return input.reconcile(target, providerId(stored?.value));
        },
      },
    });
  }

  return {
    async loadPending(
      plan: StaticExecutionPlan,
    ): Promise<readonly PendingStaticIntent[]> {
      const loaded = await load(plan);
      const pending: PendingStaticIntent[] = [];
      for (const target of loaded) {
        if (
          (await input.store.read(target.intent.logicalKey)) ||
          (await input.store.readHandoff(target.intent.logicalKey))
        )
          pending.push({ opaqueId: target.opaqueId });
      }
      return pending;
    },
    async loadApproved(
      plan: StaticExecutionPlan,
    ): Promise<readonly ApprovedStaticTarget[]> {
      const loaded = await load(plan);
      const approved: ApprovedStaticTarget[] = [];
      for (const target of loaded) {
        if (
          (await input.store.read(target.intent.logicalKey)) ||
          (await input.store.readHandoff(target.intent.logicalKey))
        )
          continue;
        const channelTarget = target.input.entry.channels.find(
          (candidate) => candidate.channel === target.channel,
        )!;
        const decision = selectStaticAction({
          now: input.now(),
          publishAt: channelTarget.publishAt,
          state: "approved",
          hasAttempt: false,
          hasProviderId: false,
          hasPlatformId: false,
        });
        if (decision === "preflight" || decision === "hold")
          approved.push({
            opaqueId: target.opaqueId,
            accountChannelKey: target.accountChannelKey,
            decision: decision === "preflight" ? "ready" : "held",
          });
      }
      return approved;
    },
    async reconcile(
      item: PendingStaticIntent,
    ): Promise<"reconciled" | "uncertain"> {
      const result = await execute(find(item.opaqueId));
      return result.kind === "found" ? "reconciled" : "uncertain";
    },
    async schedule(
      item: ApprovedStaticTarget,
    ): Promise<"accepted" | "uncertain"> {
      if (item.decision !== "ready") return "uncertain";
      const result = await execute(find(item.opaqueId));
      return result.kind === "accepted" || result.kind === "found"
        ? "accepted"
        : "uncertain";
    },
  };
}
