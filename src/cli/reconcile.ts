import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { parseEnvironment } from "../config/environment.js";
import { reconcilePublication } from "../publishing/execute.js";
import { readCampaignState, writeCampaignState } from "../state/storage.js";
import { parseAction, providerAdaptersForAction } from "./publish.js";

async function run(args: readonly string[]): Promise<void> {
  const actionIndex = args.indexOf("--action");
  const action = parseAction(args[actionIndex + 1] ?? "");
  const stateRootIndex = args.indexOf("--state-root");
  const renderRootIndex = args.indexOf("--render-root");
  const stateRoot = resolve(
    stateRootIndex >= 0 ? (args[stateRootIndex + 1] ?? "") : "state",
  );
  const state = await readCampaignState(stateRoot, action.localDate);
  if (state.plan.id !== action.campaignId)
    throw new Error("Action campaign does not match state");
  const environment = parseEnvironment(process.env, "provider");
  const adapters = providerAdaptersForAction({
    state,
    channel: action.channel,
    environment,
    renderRoot: resolve(
      renderRootIndex >= 0 ? (args[renderRootIndex + 1] ?? "") : ".tmp/render",
    ),
  });
  const result = await reconcilePublication({
    state,
    channel: action.channel,
    reconcile: adapters.reconcile,
    now: new Date(),
    persist: (value) => writeCampaignState(stateRoot, value),
  });
  process.stdout.write(
    `${JSON.stringify({ ok: true, campaignId: action.campaignId, channel: action.channel, matched: result.matched })}\n`,
  );
}

const invokedPath = process.argv[1] ? resolve(process.argv[1]) : "";
if (invokedPath === fileURLToPath(import.meta.url)) {
  run(process.argv.slice(2)).catch((error: unknown) => {
    process.stderr.write(
      `${JSON.stringify({ ok: false, error: error instanceof Error ? error.message : "Reconciliation failed" })}\n`,
    );
    process.exitCode = 1;
  });
}
