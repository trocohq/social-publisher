import { resolve } from "node:path";

import { assertPublisherHealthy } from "../publishing/health.js";
import { listCampaignStates } from "../state/storage.js";

async function run(args: readonly string[]): Promise<void> {
  const stateRootIndex = args.indexOf("--state-root");
  const stateRoot = resolve(
    stateRootIndex >= 0 ? (args[stateRootIndex + 1] ?? "") : "state",
  );
  const states = await listCampaignStates(stateRoot);
  assertPublisherHealthy(states);
  process.stdout.write(
    `${JSON.stringify({ ok: true, checkedCampaigns: states.length })}\n`,
  );
}

run(process.argv.slice(2)).catch((error: unknown) => {
  process.stderr.write(
    `${JSON.stringify({ ok: false, error: error instanceof Error ? error.message : "Health check failed" })}\n`,
  );
  process.exitCode = 1;
});
