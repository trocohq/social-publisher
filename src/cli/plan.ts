import { resolve, sep } from "node:path";
import { pathToFileURL, fileURLToPath } from "node:url";

import { loadBrand } from "../brand/load-brand.js";
import { publicationChannels } from "../config/channels.js";
import { parseEnvironment } from "../config/environment.js";
import { mediaRecordFromState } from "../media/manifest.js";
import { createPagesPayload, datesInPagesPayload } from "../media/pages.js";
import { restorePublicMedia } from "../media/restore-public.js";
import {
  createCampaign,
  historyEntryFromCampaign,
} from "../planning/create-campaign.js";
import { datesNeedingPlans } from "../planning/rolling-window.js";
import { renderFeed } from "../render/image.js";
import { renderVideo } from "../render/video.js";
import { localDateAt } from "../shared/time.js";
import { markDisabledChannels } from "../state/channel-availability.js";
import {
  campaignStateSchema,
  type CampaignState,
  type PublicationChannel,
  type Stage,
} from "../state/schema.js";
import { listCampaignStates, writeCampaignState } from "../state/storage.js";
import { transitionMedia, transitionProvider } from "../state/transitions.js";

function stageRecord(stage: Stage) {
  return { stage, attempts: 0, transitions: [] };
}

function transitionAll(
  state: CampaignState,
  to: "rendered" | "deploying",
  now: Date,
): CampaignState {
  let next = transitionMedia(state, to, now);
  for (const channel of publicationChannels) {
    if (next.channels[channel].stage === "skipped_disabled") continue;
    next = transitionProvider(next, channel, to, now);
  }
  return next;
}

async function renderCampaign(
  state: Pick<CampaignState, "plan">,
  brand: Awaited<ReturnType<typeof loadBrand>>,
  renderRoot: string,
  ffmpegPath?: string,
  ffprobePath?: string,
) {
  const campaignRoot = resolve(renderRoot, state.plan.localDate, state.plan.id);
  const feed = await renderFeed({
    plan: state.plan,
    brand,
    output: resolve(campaignRoot, "feed"),
  });
  const video = await renderVideo({
    plan: state.plan,
    brand,
    output: resolve(campaignRoot, "video"),
    ...(ffmpegPath ? { ffmpegPath } : {}),
    ...(ffprobePath ? { ffprobePath } : {}),
  });
  return { feed, video };
}

export async function runPlanning(
  workingRoot = process.cwd(),
  now = new Date(),
): Promise<Readonly<{ created: number; campaigns: number; today: string }>> {
  const environment = parseEnvironment(process.env, "planning");
  const stateRoot = resolve(workingRoot, "state");
  const renderRoot = resolve(workingRoot, ".tmp/render");
  const pagesRoot = resolve(workingRoot, ".tmp/pages");
  const brandPath = resolve(workingRoot, environment.brandRoot);
  const brand = await loadBrand(pathToFileURL(`${brandPath}${sep}`));
  const existing = await listCampaignStates(stateRoot);
  for (let index = 0; index < existing.length; index += 1) {
    const state = existing[index]!;
    const configured = markDisabledChannels(state, environment.enabled, now);
    if (configured === state) continue;
    existing[index] = configured;
    await writeCampaignState(stateRoot, configured);
  }
  const history = existing
    .map((state) => historyEntryFromCampaign(state.plan))
    .sort((left, right) => left.localDate.localeCompare(right.localDate));
  const missingDates = datesNeedingPlans(
    now,
    existing.map((state) => state.plan.localDate),
  );
  const created: CampaignState[] = [];

  for (const localDate of missingDates) {
    const plan = createCampaign({
      localDate,
      publishTime: environment.publishTime,
      history,
      playStoreUrl: environment.playStoreUrl,
    });
    const rendered = await renderCampaign(
      { plan },
      brand,
      renderRoot,
      environment.ffmpegPath,
      environment.ffprobePath,
    );
    let state = campaignStateSchema.parse({
      schemaVersion: 1,
      plan,
      sourceCommits: {
        brand: environment.brandSourceSha,
        designTokens: environment.designTokensSourceSha,
      },
      renderHashes: {
        feed: rendered.feed.hashes,
        video: rendered.video.hash,
      },
      media: stageRecord("planned"),
      channels: Object.fromEntries(
        publicationChannels.map((channel) => [channel, stageRecord("planned")]),
      ) as Record<PublicationChannel, ReturnType<typeof stageRecord>>,
    });
    state = markDisabledChannels(state, environment.enabled, now);
    state = transitionAll(state, "rendered", now);
    await writeCampaignState(stateRoot, state);
    existing.push(state);
    created.push(state);
    history.push(historyEntryFromCampaign(plan));
  }

  const payloadDates = new Set(datesInPagesPayload(localDateAt(now)));
  const included = existing
    .filter((state) => payloadDates.has(state.plan.localDate))
    .sort((left, right) =>
      left.plan.localDate.localeCompare(right.plan.localDate),
    );
  for (const state of included) {
    const rendered = await renderCampaign(
      state,
      brand,
      renderRoot,
      environment.ffmpegPath,
      environment.ffprobePath,
    );
    const renderChanged =
      JSON.stringify(rendered.feed.hashes) !==
        JSON.stringify(state.renderHashes.feed) ||
      rendered.video.hash !== state.renderHashes.video;
    if (renderChanged) {
      try {
        await restorePublicMedia({
          state,
          pagesOrigin: environment.pagesOrigin,
          renderRoot,
        });
      } catch (error) {
        throw new Error(
          `Render hash changed for immutable campaign ${state.plan.id} and its published media could not be restored`,
          { cause: error },
        );
      }
    }
  }
  await createPagesPayload({
    today: localDateAt(now),
    campaigns: included.map(mediaRecordFromState),
    renderRoot,
    pagesRoot,
  });

  for (const state of included) {
    if (state.media.stage !== "rendered") continue;
    const deploying = transitionAll(state, "deploying", now);
    await writeCampaignState(stateRoot, deploying);
  }
  return Object.freeze({
    created: created.length,
    campaigns: included.length,
    today: localDateAt(now),
  });
}

const invokedPath = process.argv[1] ? resolve(process.argv[1]) : "";
if (invokedPath === fileURLToPath(import.meta.url)) {
  runPlanning()
    .then((summary) =>
      process.stdout.write(`${JSON.stringify({ ok: true, ...summary })}\n`),
    )
    .catch((error: unknown) => {
      process.stderr.write(
        `${JSON.stringify({ ok: false, error: error instanceof Error ? error.message : "Planning failed" })}\n`,
      );
      process.exitCode = 1;
    });
}
