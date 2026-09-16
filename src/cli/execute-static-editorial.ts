import { fileURLToPath } from "node:url";

import {
  runStaticEditorialCycle,
  type ApprovedStaticTarget,
  type PendingStaticIntent,
  type StaticCycleSummary,
} from "../static-editorial/cycle.js";

type ExecutionMode = "scheduled" | "reconcile-only";
type Environment = Readonly<Record<string, string | undefined>>;
export type StaticExecutionPlan = Readonly<{
  mode: ExecutionMode;
  repositoryId: number;
  ref: string;
  status: "ready";
}>;

export function planStaticEditorialExecution(
  input: Readonly<{ args: readonly string[]; env: Environment }>,
): StaticExecutionPlan {
  if (
    input.args.length !== 2 ||
    input.args[0] !== "--mode" ||
    (input.args[1] !== "scheduled" && input.args[1] !== "reconcile-only")
  )
    throw new Error("STATIC_EXECUTION_ARGUMENT_INVALID");
  const mode = input.args[1];
  const expectedEvent = mode === "scheduled" ? "schedule" : "workflow_dispatch";
  if (input.env.GITHUB_EVENT_NAME !== expectedEvent)
    throw new Error("STATIC_EXECUTION_MODE_FORBIDDEN");
  if (input.env.STATIC_EDITORIAL_ENABLED !== "true")
    throw new Error("STATIC_EXECUTION_DISABLED");
  if (input.env.ZERO_COST_CONFIRMED !== "true")
    throw new Error("STATIC_ZERO_COST_UNVERIFIED");
  for (const name of [
    "STATIC_EDITORIAL_REPOSITORY",
    "PRIVATE_EDITORIAL_TOKEN",
    "STATIC_STATE_TOKEN",
    "BUFFER_API_KEY",
  ] as const) {
    if (!input.env[name])
      throw new Error(`STATIC_EXECUTION_CONFIG_MISSING:${name}`);
  }
  const repositoryId = Number(input.env.STATIC_EDITORIAL_REPOSITORY_ID);
  const ref = input.env.STATIC_EDITORIAL_REF ?? "";
  if (
    !Number.isSafeInteger(repositoryId) ||
    repositoryId < 1 ||
    !/^[0-9a-f]{40}$/u.test(ref)
  )
    throw new Error("STATIC_EXECUTION_IDENTITY_INVALID");
  return { mode, repositoryId, ref, status: "ready" };
}

export async function executePlannedStaticEditorial(
  input: Readonly<{
    plan: StaticExecutionPlan;
    runtime: Readonly<{
      loadPending(
        plan: StaticExecutionPlan,
      ): Promise<readonly PendingStaticIntent[]>;
      loadApproved(
        plan: StaticExecutionPlan,
      ): Promise<readonly ApprovedStaticTarget[]>;
      reconcile(item: PendingStaticIntent): Promise<"reconciled" | "uncertain">;
      schedule(item: ApprovedStaticTarget): Promise<"accepted" | "uncertain">;
    }>;
  }>,
): Promise<StaticCycleSummary> {
  const pending = await input.runtime.loadPending(input.plan);
  const approved =
    input.plan.mode === "scheduled"
      ? await input.runtime.loadApproved(input.plan)
      : [];
  return runStaticEditorialCycle({
    mode: input.plan.mode,
    pending,
    approved,
    reconcile: input.runtime.reconcile,
    schedule: input.runtime.schedule,
  });
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  planStaticEditorialExecution({
    args: process.argv.slice(2),
    env: process.env,
  });
  throw new Error("STATIC_EXECUTOR_NOT_ACTIVATED");
}
