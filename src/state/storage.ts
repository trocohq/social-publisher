import { randomUUID } from "node:crypto";
import { mkdir, open, readFile, rename } from "node:fs/promises";
import { join } from "node:path";

import {
  campaignStateSchema,
  stateIndexSchema,
  type CampaignState,
  type StateIndex,
} from "./schema.js";

async function atomicJson(path: string, value: unknown): Promise<void> {
  const temporaryPath = `${path}.${process.pid}.${randomUUID()}.tmp`;
  const serialized = `${JSON.stringify(value, null, 2)}\n`;
  const handle = await open(temporaryPath, "wx", 0o600);
  try {
    await handle.writeFile(serialized, "utf8");
    await handle.sync();
  } finally {
    await handle.close();
  }
  await rename(temporaryPath, path);
}

async function loadIndex(root: string): Promise<StateIndex> {
  try {
    return stateIndexSchema.parse(
      JSON.parse(await readFile(join(root, "index.json"), "utf8")),
    );
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return { schemaVersion: 1, campaigns: [] };
    }
    throw error;
  }
}

export async function writeCampaignState(
  root: string,
  input: CampaignState,
): Promise<void> {
  const state = campaignStateSchema.parse(input);
  const serialized = JSON.stringify(state);
  campaignStateSchema.parse(JSON.parse(serialized));
  const campaignsRoot = join(root, "campaigns");
  await mkdir(campaignsRoot, { recursive: true });
  await atomicJson(join(campaignsRoot, `${state.plan.localDate}.json`), state);

  const index = await loadIndex(root);
  const campaigns = [
    ...new Set([...index.campaigns, state.plan.localDate]),
  ].sort();
  await atomicJson(
    join(root, "index.json"),
    stateIndexSchema.parse({ schemaVersion: 1, campaigns }),
  );
}

export async function readCampaignState(
  root: string,
  localDate: string,
): Promise<CampaignState> {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(localDate)) {
    throw new Error("Invalid campaign state date");
  }
  return campaignStateSchema.parse(
    JSON.parse(
      await readFile(join(root, "campaigns", `${localDate}.json`), "utf8"),
    ),
  );
}

export async function listCampaignStates(
  root: string,
): Promise<CampaignState[]> {
  const index = await loadIndex(root);
  return Promise.all(
    index.campaigns.map((date) => readCampaignState(root, date)),
  );
}
