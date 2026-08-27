import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { recoverFixedProviderContract } from "../state/recovery.js";
import type { PublicationChannel } from "../state/schema.js";
import { readCampaignState, writeCampaignState } from "../state/storage.js";

function flagValues(args: readonly string[]): Map<string, string> {
  const values = new Map<string, string>();
  for (let index = 0; index < args.length; index += 2) {
    const flag = args[index];
    const value = args[index + 1];
    if (!flag || !value || !flag.startsWith("--")) {
      throw new Error("Recovery arguments must be flag-value pairs");
    }
    values.set(flag, value);
  }
  return values;
}

async function run(args: readonly string[]): Promise<void> {
  const flags = flagValues(args);
  const campaignId = flags.get("--campaign") ?? "";
  const channel = flags.get("--channel") as PublicationChannel | undefined;
  if (
    !/^\d{4}-\d{2}-\d{2}-[a-z0-9-]+-v\d+-\d+$/.test(campaignId) ||
    !channel ||
    !["instagram", "facebook", "tiktok"].includes(channel) ||
    flags.get("--confirm") !== "RECOVER_FIXED_PROVIDER_CONTRACT"
  ) {
    throw new Error(
      "Exact provider-contract recovery confirmation is required",
    );
  }

  const stateRoot = resolve(flags.get("--state-root") ?? "state");
  const state = await readCampaignState(stateRoot, campaignId.slice(0, 10));
  if (state.plan.id !== campaignId) {
    throw new Error("Recovery campaign does not match state");
  }
  const recovered = recoverFixedProviderContract(state, channel, new Date());
  await writeCampaignState(stateRoot, recovered);
  process.stdout.write(
    `${JSON.stringify({ ok: true, campaignId, channel, stage: recovered.channels[channel].stage })}\n`,
  );
}

const invokedPath = process.argv[1] ? resolve(process.argv[1]) : "";
if (invokedPath === fileURLToPath(import.meta.url)) {
  run(process.argv.slice(2)).catch((error: unknown) => {
    process.stderr.write(
      `${JSON.stringify({ ok: false, error: error instanceof Error ? error.message : "Recovery failed" })}\n`,
    );
    process.exitCode = 1;
  });
}
