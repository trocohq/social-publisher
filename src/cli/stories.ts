import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { z } from "zod";
import { parseEnvironment } from "../config/environment.js";
import { prepareStory, deliverStory } from "../publishing/stories.js";
import { listCampaignStates, writeCampaignState } from "../state/storage.js";

export async function runStories(args: readonly string[]): Promise<void> {
  const flag = (key: string) => {
    const index = args.indexOf(key);
    return index < 0 ? undefined : args[index + 1];
  };
  const phase = flag("--phase");
  if (phase !== "intent" && phase !== "execute")
    throw new Error("Invalid Story phase");
  const environment = parseEnvironment(
    process.env,
    phase === "intent" ? "planning" : "provider",
  );
  if (!environment.autoPublish)
    throw new Error("Story writes require AUTO_PUBLISH");
  const stateRoot = resolve(flag("--state-root") ?? "state");
  const now = new Date();
  const fresh = new Set(
    z.array(z.string()).parse(JSON.parse(flag("--new-intents") ?? "[]")),
  );
  const prepared: string[] = [];
  let failures = 0;
  if (environment.enabled.instagram) {
    for (const state of await listCampaignStates(stateRoot)) {
      if (phase === "intent") {
        const next = prepareStory(state, now);
        if (next === state) continue;
        await writeCampaignState(stateRoot, next);
        prepared.push(state.plan.id);
      } else {
        const next = await deliverStory({
          state,
          environment,
          now,
          allowCreate: fresh.has(state.plan.id),
        });
        if (next !== state) await writeCampaignState(stateRoot, next);
        if (next.instagramStory?.lastError) failures += 1;
      }
    }
  }
  if (phase === "intent") process.stdout.write(JSON.stringify(prepared) + "\n");
  else if (failures)
    throw new Error(
      `${failures} Instagram Stories need confirmation or recovery`,
    );
  else process.stdout.write(JSON.stringify({ ok: true }) + "\n");
}

if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  runStories(process.argv.slice(2)).catch(() => {
    process.stderr.write(
      "Instagram Story processing failed; inspect persisted Story state\n",
    );
    process.exitCode = 1;
  });
}
