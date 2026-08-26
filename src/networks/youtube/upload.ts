import { readFile } from "node:fs/promises";

import type { NormalizedProviderObject } from "../types.js";
import { campaignTag } from "./reconcile.js";

const UPLOAD_ENDPOINT =
  "https://www.googleapis.com/upload/youtube/v3/videos?uploadType=resumable&part=snippet%2Cstatus";

export type YouTubeVideoResource = Readonly<{
  snippet: Readonly<{
    title: string;
    description: string;
    categoryId: "27";
    defaultLanguage: "pt-BR";
    defaultAudioLanguage: "pt-BR";
    tags: readonly string[];
  }>;
  status: Readonly<{
    privacyStatus: "private" | "public";
    publishAt?: string;
    selfDeclaredMadeForKids: false;
    embeddable: true;
    license: "youtube";
  }>;
}>;

export function youtubeVideoResource({
  campaignId,
  title,
  description,
  publishAt,
  controlledImmediatePublic = false,
}: Readonly<{
  campaignId: string;
  title: string;
  description: string;
  publishAt: string;
  controlledImmediatePublic?: boolean;
}>): YouTubeVideoResource {
  if (!campaignId || !title.trim() || title.length > 100) {
    throw new Error("YouTube title or campaign ID is invalid");
  }
  if (!description.trim() || description.length > 5_000) {
    throw new Error("YouTube description is invalid");
  }
  const target = new Date(publishAt);
  if (Number.isNaN(target.valueOf()) || !publishAt.endsWith("Z")) {
    throw new Error("YouTube publishAt must be a UTC date-time");
  }
  return Object.freeze({
    snippet: Object.freeze({
      title,
      description,
      categoryId: "27",
      defaultLanguage: "pt-BR",
      defaultAudioLanguage: "pt-BR",
      tags: Object.freeze([
        "Troco",
        "troco certo",
        "caixa",
        "Shorts",
        campaignTag(campaignId),
      ]),
    }),
    status: Object.freeze({
      privacyStatus: controlledImmediatePublic ? "public" : "private",
      ...(!controlledImmediatePublic
        ? { publishAt: target.toISOString() }
        : {}),
      selfDeclaredMadeForKids: false,
      embeddable: true,
      license: "youtube",
    }),
  });
}

function requireSessionLocation(response: Response): string {
  const location = response.headers.get("location");
  if (!location) throw new Error("YouTube did not return an upload session");
  const url = new URL(location);
  if (
    url.protocol !== "https:" ||
    url.origin !== "https://www.googleapis.com" ||
    !url.pathname.startsWith("/upload/youtube/")
  ) {
    throw new Error("YouTube returned an invalid upload session origin");
  }
  return url.toString();
}

function providerFailure(status: number): Error {
  const retryable = status === 429 || status >= 500;
  return Object.assign(
    new Error(
      retryable
        ? "YouTube upload failed temporarily"
        : "YouTube rejected the upload",
    ),
    {
      category:
        status === 401 || status === 403
          ? "youtube_auth"
          : retryable
            ? "youtube_server"
            : "youtube_validation",
      statusCode: status,
      retryable,
    },
  );
}

export async function uploadYouTubeVideo({
  accessToken,
  filePath,
  resource,
  fetchImplementation = fetch,
}: Readonly<{
  accessToken: string;
  filePath: string;
  resource: YouTubeVideoResource;
  fetchImplementation?: typeof fetch;
}>): Promise<NormalizedProviderObject> {
  const bytes = await readFile(filePath);
  if (bytes.length === 0 || bytes.length > 50_000_000) {
    throw new Error("YouTube video must contain 1 byte through 50 MB");
  }
  let sessionResponse: Response;
  try {
    sessionResponse = await fetchImplementation(UPLOAD_ENDPOINT, {
      method: "POST",
      headers: {
        authorization: `Bearer ${accessToken}`,
        "content-type": "application/json; charset=UTF-8",
        "x-upload-content-length": String(bytes.length),
        "x-upload-content-type": "video/mp4",
      },
      body: JSON.stringify(resource),
      redirect: "error",
      signal: AbortSignal.timeout(30_000),
    });
  } catch {
    throw Object.assign(new Error("YouTube could not start the upload"), {
      category: "youtube_network",
      retryable: true,
    });
  }
  if (!sessionResponse.ok) throw providerFailure(sessionResponse.status);
  const sessionUrl = requireSessionLocation(sessionResponse);

  let offset = 0;
  for (let attempt = 0; attempt < 10; attempt += 1) {
    let response: Response;
    try {
      const body = bytes.subarray(offset);
      response = await fetchImplementation(sessionUrl, {
        method: "PUT",
        headers: {
          "content-type": "video/mp4",
          "content-length": String(body.length),
          "content-range": `bytes ${offset}-${bytes.length - 1}/${bytes.length}`,
        },
        body,
        redirect: "error",
        signal: AbortSignal.timeout(120_000),
      });
    } catch {
      throw Object.assign(new Error("YouTube upload was interrupted"), {
        category: "youtube_network",
        retryable: true,
      });
    }
    if (response.status === 308) {
      const range = /bytes=0-(\d+)/.exec(response.headers.get("range") ?? "");
      offset = range ? Number(range[1]) + 1 : offset;
      if (offset >= bytes.length) {
        throw new Error("YouTube upload completion response is missing");
      }
      continue;
    }
    if (!response.ok) throw providerFailure(response.status);
    const payload = (await response.json()) as {
      id?: string;
      status?: { uploadStatus?: string; privacyStatus?: string };
    };
    if (!payload.id) throw new Error("YouTube upload response has no video ID");
    return Object.freeze({
      id: payload.id,
      status:
        payload.status?.privacyStatus === "public" ? "published" : "scheduled",
      ...(resource.status.publishAt
        ? { dueAt: resource.status.publishAt }
        : {}),
      permalink: `https://www.youtube.com/watch?v=${encodeURIComponent(payload.id)}`,
    });
  }
  throw Object.assign(new Error("YouTube upload exceeded resume attempts"), {
    category: "youtube_resume_exhausted",
    retryable: true,
  });
}
