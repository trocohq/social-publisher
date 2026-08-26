import { resolve } from "node:path";

import { nextPublicationAction } from "../publishing/next-action.js";
import { listCampaignStates } from "../state/storage.js";

async function run(args: readonly string[]): Promise<void> {
  const stateRootIndex = args.indexOf("--state-root");
  const stateRoot = resolve(
    stateRootIndex >= 0 ? (args[stateRootIndex + 1] ?? "") : "state",
  );
  const action = nextPublicationAction(
    await listCampaignStates(stateRoot),
    new Date(),
  );
  process.stdout.write(
    action ? `${action.campaignId}:${action.channel}\n` : "none\n",
  );
}

run(process.argv.slice(2)).catch(() => {
  process.exitCode = 1;
});
