import { readFile } from "node:fs/promises";

const MAXIMUM_BYTES = 2_000_000;

function providerFailure(status: number): Error {
  const retryable = status === 429 || status >= 500;
  return Object.assign(
    new Error(
      retryable
        ? "YouTube thumbnail update failed temporarily"
        : "YouTube rejected the thumbnail update",
    ),
    {
      category:
        status === 401 || status === 403
          ? "youtube_thumbnail_auth"
          : retryable
            ? "youtube_thumbnail_server"
            : "youtube_thumbnail_validation",
      statusCode: status,
      retryable,
    },
  );
}

async function request(
  url: URL,
  accessToken: string,
  fetchImplementation: typeof fetch,
  init: RequestInit,
): Promise<Response> {
  try {
    return await fetchImplementation(url, {
      ...init,
      headers: {
        ...Object.fromEntries(new Headers(init.headers).entries()),
        authorization: `Bearer ${accessToken}`,
      },
      redirect: "error",
      signal: AbortSignal.timeout(30_000),
    });
  } catch {
    throw Object.assign(new Error("YouTube thumbnail request was interrupted"), {
      category: "youtube_thumbnail_network",
      retryable: true,
    });
  }
}

export async function setYouTubeThumbnail({
  accessToken,
  videoId,
  filePath,
  fetchImplementation = fetch,
}: Readonly<{
  accessToken: string;
  videoId: string;
  filePath: string;
  fetchImplementation?: typeof fetch;
}>): Promise<Readonly<{ videoId: string; permalink: string }>> {
  if (!accessToken || !videoId) {
    throw new Error("YouTube thumbnail authorization and video ID are required");
  }
  const bytes = await readFile(filePath);
  if (bytes.length === 0 || bytes.length > MAXIMUM_BYTES) {
    throw new Error("YouTube thumbnail must contain 1 byte through 2 MB");
  }

  const uploadUrl = new URL(
    "/upload/youtube/v3/thumbnails/set",
    "https://www.googleapis.com",
  );
  uploadUrl.searchParams.set("videoId", videoId);
  const upload = await request(uploadUrl, accessToken, fetchImplementation, {
    method: "POST",
    headers: {
      "content-type": "image/jpeg",
      "content-length": String(bytes.length),
    },
    body: bytes,
  });
  if (!upload.ok) throw providerFailure(upload.status);
  const uploaded = (await upload.json()) as { items?: readonly unknown[] };
  if (!uploaded.items?.length) {
    throw new Error("YouTube returned no thumbnail resource");
  }

  const verifyUrl = new URL("/youtube/v3/videos", "https://www.googleapis.com");
  verifyUrl.searchParams.set("part", "snippet");
  verifyUrl.searchParams.set("id", videoId);
  const verify = await request(verifyUrl, accessToken, fetchImplementation, {
    method: "GET",
  });
  if (!verify.ok) throw providerFailure(verify.status);
  const payload = (await verify.json()) as {
    items?: readonly {
      id?: string;
      snippet?: { thumbnails?: Readonly<Record<string, unknown>> };
    }[];
  };
  const video = payload.items?.find((item) => item.id === videoId);
  if (!video || !Object.keys(video.snippet?.thumbnails ?? {}).length) {
    throw new Error("YouTube did not verify the custom thumbnail metadata");
  }
  return Object.freeze({
    videoId,
    permalink: `https://www.youtube.com/watch?v=${encodeURIComponent(videoId)}`,
  });
}
