import { sha256 } from "../../shared/determinism.js";

export type YouTubeVideo = Readonly<{
  id: string;
  snippet?: Readonly<{ tags?: readonly string[] }>;
  status?: Readonly<{ uploadStatus?: string; privacyStatus?: string }>;
}>;

export function campaignTag(campaignId: string): string {
  if (!campaignId) throw new Error("Campaign ID is required for YouTube");
  return `troco_campaign_${sha256(campaignId).slice(0, 24)}`;
}

export function matchYouTubeUpload(
  campaignId: string,
  videos: readonly YouTubeVideo[],
): YouTubeVideo | undefined {
  const tag = campaignTag(campaignId);
  const matches = videos.filter((video) => video.snippet?.tags?.includes(tag));
  if (matches.length > 1) {
    throw new Error("Permanent YouTube reconciliation ambiguity");
  }
  return matches[0];
}

async function youtubeJson<T>({
  path,
  params,
  accessToken,
  fetchImplementation,
}: Readonly<{
  path: string;
  params: Readonly<Record<string, string>>;
  accessToken: string;
  fetchImplementation: typeof fetch;
}>): Promise<T> {
  const url = new URL(path, "https://www.googleapis.com");
  for (const [key, value] of Object.entries(params)) {
    url.searchParams.set(key, value);
  }
  const response = await fetchImplementation(url, {
    headers: { authorization: `Bearer ${accessToken}` },
    redirect: "error",
    signal: AbortSignal.timeout(20_000),
  });
  if (!response.ok) {
    throw new Error(
      response.status === 401 || response.status === 403
        ? "YouTube authorization failed"
        : "YouTube reconciliation failed",
    );
  }
  return (await response.json()) as T;
}

export async function reconcileYouTubeUpload({
  campaignId,
  accessToken,
  fetchImplementation = fetch,
}: Readonly<{
  campaignId: string;
  accessToken: string;
  fetchImplementation?: typeof fetch;
}>): Promise<YouTubeVideo | undefined> {
  const channels = await youtubeJson<{
    items?: readonly {
      contentDetails?: { relatedPlaylists?: { uploads?: string } };
    }[];
  }>({
    path: "/youtube/v3/channels",
    params: { part: "contentDetails", mine: "true" },
    accessToken,
    fetchImplementation,
  });
  const playlistId =
    channels.items?.[0]?.contentDetails?.relatedPlaylists?.uploads;
  if (!playlistId) throw new Error("YouTube uploads playlist is unavailable");

  const videoIds: string[] = [];
  let pageToken: string | undefined;
  do {
    const page = await youtubeJson<{
      nextPageToken?: string;
      items?: readonly {
        contentDetails?: { videoId?: string };
        snippet?: { resourceId?: { videoId?: string } };
      }[];
    }>({
      path: "/youtube/v3/playlistItems",
      params: {
        part: "contentDetails,snippet",
        playlistId,
        maxResults: "50",
        ...(pageToken ? { pageToken } : {}),
      },
      accessToken,
      fetchImplementation,
    });
    for (const item of page.items ?? []) {
      const id =
        item.contentDetails?.videoId ?? item.snippet?.resourceId?.videoId;
      if (id) videoIds.push(id);
    }
    pageToken = page.nextPageToken;
  } while (pageToken && videoIds.length < 200);

  const videos: YouTubeVideo[] = [];
  for (let start = 0; start < videoIds.length; start += 50) {
    const page = await youtubeJson<{ items?: readonly YouTubeVideo[] }>({
      path: "/youtube/v3/videos",
      params: {
        part: "snippet,status",
        id: videoIds.slice(start, start + 50).join(","),
      },
      accessToken,
      fetchImplementation,
    });
    videos.push(...(page.items ?? []));
  }
  return matchYouTubeUpload(campaignId, videos);
}
