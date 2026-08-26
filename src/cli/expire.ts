import { resolve } from "node:path";

import { expireRetryablePublications } from "../publishing/expire.js";
import { listCampaignStates, writeCampaignState } from "../state/storage.js";

async function run(args: readonly string[]): Promise<void> {
  const stateRootIndex = args.indexOf("--state-root");
  const stateRoot = resolve(
    stateRootIndex >= 0 ? (args[stateRootIndex + 1] ?? "") : "state",
  );
  const states = await listCampaignStates(stateRoot);
  let changed = 0;
  await expireRetryablePublications({
    states,
    now: new Date(),
    persist: async (state) => {
      await writeCampaignState(stateRoot, state);
      changed += 1;
    },
  });
  process.stdout.write(
    `${JSON.stringify({ ok: true, checkedCampaigns: states.length, changedCampaigns: changed })}\n`,
  );
}

run(process.argv.slice(2)).catch((error: unknown) => {
  process.stderr.write(
    `${JSON.stringify({ ok: false, error: error instanceof Error ? error.message : "Expiration failed" })}\n`,
  );
  process.exitCode = 1;
});
