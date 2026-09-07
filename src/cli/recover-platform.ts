import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { localDateAt } from "../shared/time.js";
import { recoverPlatformShadows } from "../publishing/platform-recovery.js";

export async function runPlatformRecovery(
  args: readonly string[],
  dependencies: Readonly<{
    environment?: Readonly<Record<string, string | undefined>>;
    now?: Date;
    fetchImplementation?: typeof fetch;
  }> = {},
) {
  const environment = dependencies.environment ?? process.env;
  if (environment.PUBLISHING_SHADOW_ENABLED !== "true")
    return {
      outcome: "disabled" as const,
      attempted: 0,
      recovered: 0,
      invalid: 0,
    };
  const flags = new Map<string, string>();
  const allowed = new Set([
    "--mode",
    "--campaign",
    "--confirm",
    "--state-root",
    "--render-root",
    "--publishing-outbox-root",
  ]);
  for (let index = 0; index < args.length; index += 2) {
    const key = args[index];
    const value = args[index + 1];
    if (!key || !allowed.has(key) || !value || flags.has(key))
      throw new Error("PUBLISHING_SHADOW_RECOVERY_ARGUMENTS_INVALID");
    flags.set(key, value);
  }
  const mode = flags.get("--mode");
  const campaignId = flags.get("--campaign");
  const now = dependencies.now ?? new Date();
  const scheduled =
    mode === "scheduled" &&
    environment.AUTO_PUBLISH === "true" &&
    !campaignId &&
    !flags.has("--confirm");
  const controlled =
    mode === "controlled" &&
    campaignId &&
    /^\d{4}-\d{2}-\d{2}-[a-z0-9-]+-v\d+-\d+$/.test(campaignId) &&
    campaignId.slice(0, 10) > localDateAt(now) &&
    flags.get("--confirm") === "PUBLISH_ONE_CAMPAIGN";
  if (!scheduled && !controlled)
    throw new Error("PUBLISHING_SHADOW_RECOVERY_AUTHORIZATION_REQUIRED");
  return recoverPlatformShadows({
    environment,
    now,
    stateRoot: resolve(flags.get("--state-root") ?? "state"),
    renderRoot: resolve(flags.get("--render-root") ?? ".tmp/render"),
    outboxDirectory: resolve(
      flags.get("--publishing-outbox-root") ?? ".publishing/shadow",
    ),
    ...(campaignId ? { campaignId } : {}),
    ...(dependencies.fetchImplementation
      ? { fetchImplementation: dependencies.fetchImplementation }
      : {}),
  });
}

export function platformRecoveryExitCode(result: {
  outcome: "disabled" | "accepted" | "pending" | "retry-later";
}): 0 | 1 {
  return result.outcome === "retry-later" ? 1 : 0;
}

if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  runPlatformRecovery(process.argv.slice(2))
    .then((result) => {
      process.stdout.write(`${JSON.stringify(result)}\n`);
      process.exitCode = platformRecoveryExitCode(result);
    })
    .catch(() => {
      process.stderr.write("PUBLISHING_SHADOW_RECOVERY_FAILED\n");
      process.exitCode = 1;
    });
}
