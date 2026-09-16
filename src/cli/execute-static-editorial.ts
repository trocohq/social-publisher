import { fileURLToPath } from "node:url";

type ExecutionMode = "scheduled" | "reconcile-only";
type Environment = Readonly<Record<string, string | undefined>>;

export function planStaticEditorialExecution(
  input: Readonly<{ args: readonly string[]; env: Environment }>,
): Readonly<{
  mode: ExecutionMode;
  repositoryId: number;
  ref: string;
  status: "ready";
}> {
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

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  planStaticEditorialExecution({
    args: process.argv.slice(2),
    env: process.env,
  });
  throw new Error("STATIC_EXECUTOR_NOT_ACTIVATED");
}
