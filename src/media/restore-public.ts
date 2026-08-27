import { mkdir, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";

import type { CampaignState } from "../state/schema.js";
import { sha256 } from "../shared/determinism.js";
import { mediaRecordFromState } from "./manifest.js";
import { publicMediaUrls } from "./pages.js";

const MAXIMUM_BYTES = 50_000_000;

export async function restorePublicMedia({
  state,
  pagesOrigin,
  renderRoot,
  fetchImplementation = fetch,
}: Readonly<{
  state: CampaignState;
  pagesOrigin: string;
  renderRoot: string;
  fetchImplementation?: typeof fetch;
}>): Promise<void> {
  const record = mediaRecordFromState(state);
  const urls = publicMediaUrls(pagesOrigin, record);
  let feedIndex = 0;

  for (const asset of record.assets) {
    const url = asset.kind === "feed" ? urls.feed[feedIndex++] : urls.video;
    if (!url) throw new Error("Public media URL is missing");

    const response = await fetchImplementation(new URL(url), {
      method: "GET",
      redirect: "error",
      cache: "no-store",
      signal: AbortSignal.timeout(15_000),
    });
    if (response.status !== 200) {
      throw new Error(`Public media returned HTTP ${response.status}`);
    }
    const contentType = response.headers.get("content-type") ?? "";
    if (contentType !== asset.contentType) {
      throw new Error("Public media content type mismatch");
    }
    const declaredLength = Number(response.headers.get("content-length"));
    if (declaredLength > MAXIMUM_BYTES) {
      throw new Error("Public media exceeds 50 MB");
    }

    const bytes = Buffer.from(await response.arrayBuffer());
    if (bytes.length > MAXIMUM_BYTES) {
      throw new Error("Public media exceeds 50 MB");
    }
    if (sha256(bytes) !== asset.hash) {
      throw new Error("Public media hash mismatch");
    }

    const directory = resolve(
      renderRoot,
      record.localDate,
      record.campaignId,
      asset.kind,
    );
    await mkdir(directory, { recursive: true });
    await writeFile(join(directory, asset.filename), bytes);
  }
}
