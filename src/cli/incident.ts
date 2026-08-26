import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { parseEnvironment } from "../config/environment.js";
import {
  syncGithubIncident,
  type IncidentContext,
} from "../incidents/github.js";
import type { PublicationChannel } from "../state/schema.js";
import { listCampaignStates } from "../state/storage.js";

const channels = ["instagram", "facebook", "tiktok", "youtube"] as const;

async function run(args: readonly string[]): Promise<void> {
  const mode = args[0];
  if (mode !== "failure" && mode !== "recovery") {
    throw new Error("Incident mode must be failure or recovery");
  }
  const environment = parseEnvironment(process.env, "incident");
  const repository = environment.github.repository!;
  const token = environment.github.token!;
  const stateRootIndex = args.indexOf("--state-root");
  const stateRoot = resolve(
    stateRootIndex >= 0 ? (args[stateRootIndex + 1] ?? "") : "state",
  );
  let context: IncidentContext | undefined;

  if (mode === "failure") {
    const states = (await listCampaignStates(stateRoot)).sort((left, right) =>
      right.plan.localDate.localeCompare(left.plan.localDate),
    );
    const failure = states
      .flatMap((state) =>
        channels.map((channel) => ({
          state,
          channel,
          record: state.channels[channel],
        })),
      )
      .find(
        ({ record }) =>
          (record.stage === "failed" || record.stage === "retryable") &&
          record.lastError,
      );
    if (!failure?.record.lastError) {
      throw new Error("No sanitized failed campaign state is available");
    }
    const observedAt = new Date().toISOString();
    const firstObservedAt =
      failure.record.transitions.find(
        (transition) =>
          transition.to === "failed" || transition.to === "retryable",
      )?.at ?? observedAt;
    const runId = process.env.GITHUB_RUN_ID;
    if (!runId || !/^\d+$/.test(runId)) {
      throw new Error("GITHUB_RUN_ID is required for incident reporting");
    }
    context = {
      campaignId: failure.state.plan.id,
      channel: failure.channel satisfies PublicationChannel,
      stage: failure.record.stage,
      error: failure.record.lastError,
      firstObservedAt,
      lastObservedAt: observedAt,
      attempts: failure.record.attempts,
      actionsRunUrl: `https://github.com/${repository}/actions/runs/${runId}`,
    };
  }

  const result = await syncGithubIncident({
    mode,
    repository,
    token,
    ...(context ? { context } : {}),
  });
  process.stdout.write(
    `${JSON.stringify({ ok: true, mutation: result.kind })}\n`,
  );
}

const invokedPath = process.argv[1] ? resolve(process.argv[1]) : "";
if (invokedPath === fileURLToPath(import.meta.url)) {
  run(process.argv.slice(2)).catch((error: unknown) => {
    process.stderr.write(
      `${JSON.stringify({ ok: false, error: error instanceof Error ? error.message : "Incident handling failed" })}\n`,
    );
    process.exitCode = 1;
  });
}
