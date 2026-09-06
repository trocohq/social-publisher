import { copyFile, mkdir, mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import type { CampaignState } from "../state/schema.js";
import { sha256 } from "../shared/determinism.js";
import { mediaRecordFromState } from "./manifest.js";
import { requireSafeSource } from "./pages.js";
import { restorePublicMedia } from "./restore-public.js";

async function matches(state: CampaignState, root: string): Promise<boolean> {
  let valid = true;
  for (const asset of mediaRecordFromState(state).assets) {
    const file = join(
      root,
      state.plan.localDate,
      state.plan.id,
      asset.kind,
      asset.filename,
    );
    try {
      await requireSafeSource(root, file);
      const bytes = await readFile(file);
      if (bytes.length > 50_000_000 || sha256(bytes) !== asset.hash)
        valid = false;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") valid = false;
      else throw error;
    }
  }
  return valid;
}

export async function ensureImmutableMedia({
  state,
  renderRoot,
  pagesOrigin,
  render,
  fetchImplementation,
}: Readonly<{
  state: CampaignState;
  renderRoot: string;
  pagesOrigin: string;
  render: (scratchRoot: string) => Promise<unknown>;
  fetchImplementation?: typeof fetch;
}>): Promise<"local" | "public" | "render"> {
  if (await matches(state, renderRoot)) return "local";
  // Never write a newly rendered variant over an immutable original.
  const scratch = await mkdtemp(join(tmpdir(), "troco-immutable-"));
  let source: "public" | "render" = "public";
  try {
    try {
      await restorePublicMedia({
        state,
        pagesOrigin,
        renderRoot: scratch,
        ...(fetchImplementation ? { fetchImplementation } : {}),
      });
    } catch {
      source = "render";
      await render(scratch);
    }
    if (!(await matches(state, scratch))) {
      throw new Error(
        `Original media unavailable for ${state.plan.id}; restore its verified media archive before deployment. Immutable hashes were preserved.`,
      );
    }
    for (const asset of mediaRecordFromState(state).assets) {
      const suffix = join(
        state.plan.localDate,
        state.plan.id,
        asset.kind,
        asset.filename,
      );
      const destination = join(renderRoot, suffix);
      await mkdir(dirname(destination), { recursive: true });
      await copyFile(join(scratch, suffix), destination);
    }
    return source;
  } finally {
    await rm(scratch, { recursive: true, force: true });
  }
}
