import type { YouTubeVideo } from "../networks/youtube/reconcile.js";
import { sanitizeError } from "../state/sanitize.js";
import {
  assertMatchingThumbnail,
  recordThumbnailBackfillOutcome,
  type ThumbnailBackfillAudit,
} from "./schema.js";
import { readThumbnailBackfill, writeThumbnailBackfill } from "./storage.js";

type ResolveVideo = () => Promise<YouTubeVideo | undefined>;
type SetThumbnail = (
  input: Readonly<{
    accessToken: string;
    videoId: string;
    filePath: string;
  }>,
) => Promise<Readonly<{ videoId: string; permalink: string }>>;

async function currentAudit(
  stateRoot: string,
  candidate: ThumbnailBackfillAudit,
): Promise<ThumbnailBackfillAudit> {
  const stored = await readThumbnailBackfill(stateRoot, candidate.campaignId);
  if (!stored) return candidate;
  assertMatchingThumbnail(stored, candidate.thumbnail);
  return stored;
}

export async function executeYouTubeThumbnailBackfill({
  stateRoot,
  audit,
  thumbnailFile,
  accessToken,
  now,
  resolveVideo,
  setThumbnail,
}: Readonly<{
  stateRoot: string;
  audit: ThumbnailBackfillAudit;
  thumbnailFile: string;
  accessToken: string;
  now: Date;
  resolveVideo: ResolveVideo;
  setThumbnail: SetThumbnail;
}>): Promise<
  Readonly<{
    action: "updated" | "skipped" | "not_found";
    audit: ThumbnailBackfillAudit;
  }>
> {
  let current = await currentAudit(stateRoot, audit);
  if (current.channels.youtube.status === "updated") {
    return { action: "skipped", audit: current };
  }

  try {
    const video = await resolveVideo();
    if (!video) {
      current = recordThumbnailBackfillOutcome({
        audit: current,
        channel: "youtube",
        outcome: { status: "not_found" },
        now,
      });
      await writeThumbnailBackfill(stateRoot, current);
      return { action: "not_found", audit: current };
    }
    if (video.status?.privacyStatus !== "public") {
      throw Object.assign(
        new Error("YouTube backfill requires a public Short"),
        {
          category: "youtube_thumbnail_visibility",
        },
      );
    }
    const provider = await setThumbnail({
      accessToken,
      videoId: video.id,
      filePath: thumbnailFile,
    });
    current = recordThumbnailBackfillOutcome({
      audit: current,
      channel: "youtube",
      outcome: {
        status: "updated",
        nativeProviderId: provider.videoId,
        permalink: provider.permalink,
      },
      now,
    });
    await writeThumbnailBackfill(stateRoot, current);
    return { action: "updated", audit: current };
  } catch (error) {
    current = recordThumbnailBackfillOutcome({
      audit: current,
      channel: "youtube",
      outcome: { status: "failed", lastError: sanitizeError(error) },
      now,
    });
    await writeThumbnailBackfill(stateRoot, current);
    throw error;
  }
}

export async function recordNativeThumbnailBackfill({
  stateRoot,
  audit,
  channel,
  status,
  now,
}: Readonly<{
  stateRoot: string;
  audit: ThumbnailBackfillAudit;
  channel: "instagram" | "facebook";
  status: "updated" | "unsupported" | "not_found" | "failed";
  now: Date;
}>): Promise<ThumbnailBackfillAudit> {
  const current = await currentAudit(stateRoot, audit);
  const outcome =
    status === "failed"
      ? {
          status,
          lastError: sanitizeError(
            Object.assign(
              new Error("Native cover update failed during controlled review"),
              { category: "native_thumbnail_update" },
            ),
          ),
        }
      : { status };
  const next = recordThumbnailBackfillOutcome({
    audit: current,
    channel,
    outcome,
    now,
  });
  await writeThumbnailBackfill(stateRoot, next);
  return next;
}
