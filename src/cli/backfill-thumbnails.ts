import { resolve, sep } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import {
  preparePublishedThumbnail,
  requirePublishedBackfillChannel,
} from "../backfill/prepare.js";
import { createThumbnailBackfillAudit } from "../backfill/schema.js";
import {
  executeYouTubeThumbnailBackfill,
  recordNativeThumbnailBackfill,
} from "../backfill/service.js";
import { createYouTubeAccessTokenProvider } from "../networks/youtube/oauth.js";
import { reconcileYouTubeUpload } from "../networks/youtube/reconcile.js";
import { setYouTubeThumbnail } from "../networks/youtube/thumbnail.js";
import { sanitizeError } from "../state/sanitize.js";
import { readCampaignState } from "../state/storage.js";

type BackfillBase = Readonly<{
  campaignId: string;
  brandRoot: string;
  stateRoot: string;
  outputRoot: string;
}>;

export type BackfillRequest =
  | (BackfillBase & Readonly<{ mode: "prepare" }>)
  | (BackfillBase & Readonly<{ mode: "youtube"; channel: "youtube" }>)
  | (BackfillBase &
      Readonly<{
        mode: "record";
        channel: "instagram" | "facebook";
        status: "updated" | "unsupported" | "not_found" | "failed";
      }>);

const campaignPattern = /^\d{4}-\d{2}-\d{2}-[a-z0-9-]+-v\d+-\d+$/;
const valueFlags = new Set([
  "--campaign",
  "--brand-root",
  "--state-root",
  "--output",
  "--channel",
  "--record",
  "--confirm",
]);

function directoryUrl(path: string): URL {
  return pathToFileURL(path.endsWith(sep) ? path : `${path}${sep}`);
}

export function parseBackfillArguments(
  args: readonly string[],
): BackfillRequest {
  const values = new Map<string, string>();
  let execute = false;
  for (let index = 0; index < args.length;) {
    const flag = args[index];
    if (flag === "--execute") {
      if (execute) throw new Error("Duplicate argument: --execute");
      execute = true;
      index += 1;
      continue;
    }
    if (!flag || !valueFlags.has(flag)) {
      throw new Error(`Unknown argument: ${flag ?? "<missing>"}`);
    }
    const value = args[index + 1];
    if (!value || value.startsWith("--")) {
      throw new Error(`Missing value for ${flag}`);
    }
    if (values.has(flag)) throw new Error(`Duplicate argument: ${flag}`);
    values.set(flag, value);
    index += 2;
  }

  const campaignId = values.get("--campaign") ?? "";
  const brandRoot = values.get("--brand-root") ?? "";
  if (!campaignPattern.test(campaignId)) {
    throw new Error("One exact campaign ID is required");
  }
  if (!brandRoot) throw new Error("--brand-root is required");
  const base = {
    campaignId,
    brandRoot,
    stateRoot: values.get("--state-root") ?? "state",
    outputRoot: values.get("--output") ?? ".tmp/thumbnail-backfill",
  } as const;
  const channel = values.get("--channel");
  const record = values.get("--record");
  const confirmation = values.get("--confirm");

  if (execute && record) {
    throw new Error("Backfill cannot execute and record simultaneously");
  }
  if (execute) {
    if (channel !== "youtube" || confirmation !== campaignId) {
      throw new Error("Exact YouTube backfill confirmation is required");
    }
    return { ...base, mode: "youtube", channel: "youtube" };
  }
  if (record) {
    if (channel !== "instagram" && channel !== "facebook") {
      throw new Error("Only a native Meta outcome may be recorded");
    }
    if (
      !new Set(["updated", "unsupported", "not_found", "failed"]).has(record)
    ) {
      throw new Error("Invalid native thumbnail outcome");
    }
    if (confirmation !== campaignId) {
      throw new Error("Exact native backfill confirmation is required");
    }
    return {
      ...base,
      mode: "record",
      channel,
      status: record as "updated" | "unsupported" | "not_found" | "failed",
    };
  }
  if (channel || confirmation) {
    throw new Error("Prepare mode does not accept channel or confirmation");
  }
  return { ...base, mode: "prepare" };
}

export async function run(
  request: BackfillRequest,
  environment: NodeJS.ProcessEnv = process.env,
  now = new Date(),
): Promise<void> {
  const state = await readCampaignState(
    resolve(request.stateRoot),
    request.campaignId.slice(0, 10),
  );
  if (state.plan.id !== request.campaignId) {
    throw new Error("Backfill campaign does not match state");
  }
  const prepared = await preparePublishedThumbnail({
    state,
    campaignId: request.campaignId,
    brandRoot: directoryUrl(resolve(request.brandRoot)),
    outputRoot: resolve(request.outputRoot),
  });
  const thumbnail = {
    hash: prepared.thumbnail.hash,
    width: prepared.thumbnail.width,
    height: prepared.thumbnail.height,
    format: prepared.thumbnail.format,
  } as const;
  const audit = createThumbnailBackfillAudit({
    campaignId: request.campaignId,
    thumbnail,
    bufferProviderIds: {
      ...(state.channels.instagram.providerId
        ? { instagram: state.channels.instagram.providerId }
        : {}),
      ...(state.channels.facebook.providerId
        ? { facebook: state.channels.facebook.providerId }
        : {}),
      ...(state.channels.youtube.providerId
        ? { youtube: state.channels.youtube.providerId }
        : {}),
    },
  });

  if (request.mode === "prepare") {
    process.stdout.write(
      `${JSON.stringify({
        ok: true,
        mode: request.mode,
        campaignId: request.campaignId,
        thumbnail: {
          path: prepared.thumbnail.file,
          hash: prepared.thumbnail.hash,
        },
        review: prepared.reviewHtml,
      })}\n`,
    );
    return;
  }

  if (request.mode === "record") {
    requirePublishedBackfillChannel(state, request.campaignId, request.channel);
    const result = await recordNativeThumbnailBackfill({
      stateRoot: resolve(request.stateRoot),
      audit,
      channel: request.channel,
      status: request.status,
      now,
    });
    process.stdout.write(
      `${JSON.stringify({
        ok: true,
        mode: request.mode,
        campaignId: request.campaignId,
        channel: request.channel,
        status: result.channels[request.channel].status,
      })}\n`,
    );
    return;
  }

  requirePublishedBackfillChannel(state, request.campaignId, "youtube");
  const clientId = environment.YOUTUBE_CLIENT_ID ?? "";
  const clientSecret = environment.YOUTUBE_CLIENT_SECRET ?? "";
  const refreshToken = environment.YOUTUBE_REFRESH_TOKEN ?? "";
  if (!clientId || !clientSecret || !refreshToken) {
    throw new Error("YouTube thumbnail OAuth credentials are incomplete");
  }
  const tokenProvider = createYouTubeAccessTokenProvider({
    clientId,
    clientSecret,
    refreshToken,
  });
  const accessToken = await tokenProvider.getAccessToken(now);
  const result = await executeYouTubeThumbnailBackfill({
    stateRoot: resolve(request.stateRoot),
    audit,
    thumbnailFile: prepared.thumbnail.file,
    accessToken,
    now,
    resolveVideo: () =>
      reconcileYouTubeUpload({
        campaignId: request.campaignId,
        accessToken,
      }),
    setThumbnail: ({ accessToken, videoId, filePath }) =>
      setYouTubeThumbnail({ accessToken, videoId, filePath }),
  });
  process.stdout.write(
    `${JSON.stringify({
      ok: true,
      mode: request.mode,
      campaignId: request.campaignId,
      channel: "youtube",
      action: result.action,
      status: result.audit.channels.youtube.status,
    })}\n`,
  );
}

const invokedPath = process.argv[1] ? resolve(process.argv[1]) : "";
if (invokedPath === fileURLToPath(import.meta.url)) {
  const request = (() => {
    try {
      return parseBackfillArguments(process.argv.slice(2));
    } catch (error) {
      const sanitized = sanitizeError(error);
      process.stderr.write(
        `${JSON.stringify({ ok: false, error: sanitized })}\n`,
      );
      process.exitCode = 1;
      return undefined;
    }
  })();
  if (request) {
    run(request).catch((error: unknown) => {
      const sanitized = sanitizeError(error);
      process.stderr.write(
        `${JSON.stringify({ ok: false, error: sanitized })}\n`,
      );
      process.exitCode = 1;
    });
  }
}
