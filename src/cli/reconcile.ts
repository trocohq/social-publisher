import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { parseEnvironment } from "../config/environment.js";
import {
  assertPublicationSucceeded,
  reconcilePublication,
} from "../publishing/execute.js";
import type { CampaignState, PublicationChannel } from "../state/schema.js";
import {
  listCampaignStates,
  readCampaignState,
  writeCampaignState,
} from "../state/storage.js";
import { parseAction, providerAdaptersForAction } from "./publish.js";
import { reconcileFailedBufferPublication } from "../publishing/failed-buffer-reconciliation.js";

export async function runReconcile(
  args: readonly string[],
  dependencies: Readonly<{
    environment?: Readonly<Record<string, string | undefined>>;
    fetchImplementation?: typeof fetch;
    now?: () => Date;
  }> = {},
): Promise<void> {
  const actionIndex = args.indexOf("--action");
  const recoverFailed = args.includes("--recover-failed");
  if (
    recoverFailed &&
    (actionIndex < 0 ||
      args.filter((value) => value === "--action").length !== 1)
  ) {
    throw new Error("Failed Buffer recovery requires one explicit --action");
  }
  const stateRootIndex = args.indexOf("--state-root");
  const renderRootIndex = args.indexOf("--render-root");
  const stateRoot = resolve(
    stateRootIndex >= 0 ? (args[stateRootIndex + 1] ?? "") : "state",
  );
  const renderRoot = resolve(
    renderRootIndex >= 0 ? (args[renderRootIndex + 1] ?? "") : ".tmp/render",
  );
  const environment = parseEnvironment(
    dependencies.environment ?? process.env,
    "provider",
  );
  const targets: { state: CampaignState; channel: PublicationChannel }[] = [];

  if (actionIndex >= 0) {
    const action = parseAction(args[actionIndex + 1] ?? "");
    const state = await readCampaignState(stateRoot, action.localDate);
    if (state.plan.id !== action.campaignId) {
      throw new Error("Action campaign does not match state");
    }
    targets.push({ state, channel: action.channel });
  } else {
    for (const state of await listCampaignStates(stateRoot)) {
      for (const channel of [
        "instagram",
        "facebook",
        "tiktok",
        "youtube",
      ] as const) {
        const record = state.channels[channel];
        const dueAt = record.scheduledAt ?? state.plan.targetAt;
        if (
          record.stage === "scheduling" ||
          record.stage === "publishing" ||
          (record.stage === "scheduled" &&
            new Date(dueAt).valueOf() <= Date.now())
        ) {
          targets.push({ state, channel });
        }
      }
    }
  }

  let matched = 0;
  for (const target of targets) {
    const latest = await readCampaignState(
      stateRoot,
      target.state.plan.localDate,
    );
    const adapters = providerAdaptersForAction({
      state: latest,
      channel: target.channel,
      mode: "controlled",
      phase:
        latest.channels[target.channel].stage === "publishing"
          ? "publishing"
          : "scheduling",
      environment,
      renderRoot,
      ...(dependencies.fetchImplementation
        ? { bufferFetchImplementation: dependencies.fetchImplementation }
        : {}),
    });
    const reconciliation = {
      state: latest,
      channel: target.channel,
      reconcile: adapters.reconcile,
      now: dependencies.now?.() ?? new Date(),
      persist: (value: CampaignState) => writeCampaignState(stateRoot, value),
    };
    const result = recoverFailed
      ? await reconcileFailedBufferPublication({
          ...reconciliation,
          bufferChannelId: environment.buffer.channelIds[target.channel],
        })
      : await reconcilePublication(reconciliation);
    if (recoverFailed) {
      if (
        !result.matched &&
        latest.channels[target.channel].stage === "failed"
      ) {
        throw new Error("Failed Buffer recovery was not confirmed");
      }
    } else assertPublicationSucceeded(result.state, target.channel);
    if (result.matched) matched += 1;
  }
  process.stdout.write(
    `${JSON.stringify({ ok: true, checked: targets.length, matched })}\n`,
  );
}

const invokedPath = process.argv[1] ? resolve(process.argv[1]) : "";
if (invokedPath === fileURLToPath(import.meta.url)) {
  runReconcile(process.argv.slice(2)).catch((error: unknown) => {
    process.stderr.write(
      `${JSON.stringify({ ok: false, error: error instanceof Error ? error.message : "Reconciliation failed" })}\n`,
    );
    process.exitCode = 1;
  });
}
