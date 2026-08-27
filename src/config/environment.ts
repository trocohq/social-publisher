import { z } from "zod";

import {
  enabledBufferChannels,
  enabledPublicationChannels,
  type BufferChannelName,
  type ChannelEnablement,
} from "./channels.js";

const shaSchema = z.string().regex(/^[a-f0-9]{40}$/);
const nonEmpty = z.string().min(1);
const optionalNonEmpty = z.preprocess(
  (value) => (value === "" ? undefined : value),
  nonEmpty.optional(),
);
const httpsUrl = z.string().refine((value) => {
  try {
    const url = new URL(value);
    return (
      url.protocol === "https:" &&
      !url.username &&
      !url.password &&
      !url.search &&
      !url.hash
    );
  } catch {
    return false;
  }
});
const timeZoneSchema = z.literal("America/Sao_Paulo");

const environmentSchema = z.object({
  AUTO_PUBLISH: z
    .enum(["true", "false"])
    .default("false")
    .transform((value) => value === "true"),
  YOUTUBE_PUBLICATION_VERIFIED: z
    .enum(["true", "false"])
    .default("false")
    .transform((value) => value === "true"),
  INSTAGRAM_ENABLED: z
    .enum(["true", "false"])
    .default("true")
    .transform((value) => value === "true"),
  FACEBOOK_ENABLED: z
    .enum(["true", "false"])
    .default("true")
    .transform((value) => value === "true"),
  TIKTOK_ENABLED: z
    .enum(["true", "false"])
    .default("true")
    .transform((value) => value === "true"),
  YOUTUBE_ENABLED: z
    .enum(["true", "false"])
    .default("true")
    .transform((value) => value === "true"),
  PUBLICATION_TIME_ZONE: timeZoneSchema,
  PUBLISH_TIME: z.string().regex(/^(?:[01]\d|2[0-3]):[0-5]\d$/),
  PAGES_ORIGIN: httpsUrl,
  BUFFER_ORGANIZATION_ID: optionalNonEmpty,
  BUFFER_INSTAGRAM_CHANNEL_ID: optionalNonEmpty,
  BUFFER_FACEBOOK_CHANNEL_ID: optionalNonEmpty,
  BUFFER_TIKTOK_CHANNEL_ID: optionalNonEmpty,
  YOUTUBE_CHANNEL_ID: optionalNonEmpty,
  PLAY_STORE_URL: z.string().refine((value) => {
    try {
      const url = new URL(value);
      return (
        url.protocol === "https:" &&
        url.hostname === "play.google.com" &&
        url.pathname === "/store/apps/details"
      );
    } catch {
      return false;
    }
  }),
  BRAND_SOURCE_SHA: shaSchema,
  DESIGN_TOKENS_SOURCE_SHA: shaSchema,
  BRAND_ROOT: z.string().min(1).default("dependencies/frontend/public"),
  FFMPEG_PATH: z.string().optional(),
  FFPROBE_PATH: z.string().optional(),
  BUFFER_API_KEY: optionalNonEmpty,
  YOUTUBE_CLIENT_ID: optionalNonEmpty,
  YOUTUBE_CLIENT_SECRET: optionalNonEmpty,
  YOUTUBE_REFRESH_TOKEN: optionalNonEmpty,
  GITHUB_REPOSITORY: z
    .string()
    .regex(/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/)
    .optional(),
  GITHUB_TOKEN: nonEmpty.optional(),
});

export type EnvironmentPurpose = "planning" | "provider" | "incident";

export type PublisherEnvironment = Readonly<{
  autoPublish: boolean;
  enabled: ChannelEnablement;
  publicationTimeZone: string;
  publishTime: string;
  pagesOrigin: string;
  playStoreUrl: string;
  brandSourceSha: string;
  designTokensSourceSha: string;
  brandRoot: string;
  ffmpegPath?: string;
  ffprobePath?: string;
  buffer: Readonly<{
    organizationId?: string;
    channelIds: Readonly<Partial<Record<BufferChannelName, string>>>;
    apiKey?: string;
  }>;
  youtube: Readonly<{
    channelId?: string;
    publicationVerified: boolean;
    clientId?: string;
    clientSecret?: string;
    refreshToken?: string;
  }>;
  github: Readonly<{ repository?: string; token?: string }>;
  origins: Readonly<{
    buffer: "https://api.buffer.com";
    googleOauth: "https://oauth2.googleapis.com";
    googleApis: "https://www.googleapis.com";
    pages: string;
  }>;
}>;

function invalidEnvironment(issues: readonly z.core.$ZodIssue[]): Error {
  const fields = [
    ...new Set(issues.map((issue) => issue.path[0] ?? "environment")),
  ];
  return new Error(`Invalid environment configuration: ${fields.join(", ")}`);
}

function requireFields(
  parsed: z.infer<typeof environmentSchema>,
  fields: readonly (keyof typeof parsed)[],
): void {
  const missing = fields.filter((field) => !parsed[field]);
  if (missing.length > 0) {
    throw new Error(`Missing environment configuration: ${missing.join(", ")}`);
  }
}

export function parseEnvironment(
  source: Readonly<Record<string, string | undefined>>,
  purpose: EnvironmentPurpose = "planning",
): PublisherEnvironment {
  const selected = Object.fromEntries(
    Object.keys(environmentSchema.shape).map((key) => [key, source[key]]),
  );
  const result = environmentSchema.safeParse(selected);
  if (!result.success) throw invalidEnvironment(result.error.issues);
  const parsed = result.data;

  const enabled: ChannelEnablement = Object.freeze({
    instagram: parsed.INSTAGRAM_ENABLED,
    facebook: parsed.FACEBOOK_ENABLED,
    tiktok: parsed.TIKTOK_ENABLED,
    youtube: parsed.YOUTUBE_ENABLED,
  });
  if (enabledPublicationChannels(enabled).length === 0) {
    throw new Error(
      "Invalid environment configuration: enabled social channel",
    );
  }

  const requiredIds = [
    ["instagram", "BUFFER_INSTAGRAM_CHANNEL_ID"],
    ["facebook", "BUFFER_FACEBOOK_CHANNEL_ID"],
    ["tiktok", "BUFFER_TIKTOK_CHANNEL_ID"],
    ["youtube", "YOUTUBE_CHANNEL_ID"],
  ] as const;
  const missingIds = requiredIds
    .filter(([channel, field]) => enabled[channel] && !parsed[field])
    .map(([, field]) => field);
  if (missingIds.length > 0) {
    throw new Error(
      `Missing environment configuration: ${missingIds.join(", ")}`,
    );
  }

  if (purpose === "provider") {
    if (enabledBufferChannels(enabled).length > 0) {
      requireFields(parsed, ["BUFFER_ORGANIZATION_ID", "BUFFER_API_KEY"]);
    }
    if (enabled.youtube) {
      requireFields(parsed, [
        "YOUTUBE_CLIENT_ID",
        "YOUTUBE_CLIENT_SECRET",
        "YOUTUBE_REFRESH_TOKEN",
      ]);
    }
  }
  if (purpose === "incident") {
    requireFields(parsed, ["GITHUB_REPOSITORY", "GITHUB_TOKEN"]);
  }

  return Object.freeze({
    autoPublish: parsed.AUTO_PUBLISH,
    enabled,
    publicationTimeZone: parsed.PUBLICATION_TIME_ZONE,
    publishTime: parsed.PUBLISH_TIME,
    pagesOrigin: parsed.PAGES_ORIGIN.replace(/\/$/, ""),
    playStoreUrl: parsed.PLAY_STORE_URL,
    brandSourceSha: parsed.BRAND_SOURCE_SHA,
    designTokensSourceSha: parsed.DESIGN_TOKENS_SOURCE_SHA,
    brandRoot: parsed.BRAND_ROOT,
    ...(parsed.FFMPEG_PATH ? { ffmpegPath: parsed.FFMPEG_PATH } : {}),
    ...(parsed.FFPROBE_PATH ? { ffprobePath: parsed.FFPROBE_PATH } : {}),
    buffer: Object.freeze({
      ...(enabledBufferChannels(enabled).length > 0 &&
      parsed.BUFFER_ORGANIZATION_ID
        ? { organizationId: parsed.BUFFER_ORGANIZATION_ID }
        : {}),
      channelIds: Object.freeze(
        Object.fromEntries(
          enabledBufferChannels(enabled).flatMap((channel) => {
            const field =
              channel === "instagram"
                ? "BUFFER_INSTAGRAM_CHANNEL_ID"
                : channel === "facebook"
                  ? "BUFFER_FACEBOOK_CHANNEL_ID"
                  : "BUFFER_TIKTOK_CHANNEL_ID";
            const id = parsed[field];
            return id ? [[channel, id] as const] : [];
          }),
        ) as Partial<Record<BufferChannelName, string>>,
      ),
      ...(enabledBufferChannels(enabled).length > 0 && parsed.BUFFER_API_KEY
        ? { apiKey: parsed.BUFFER_API_KEY }
        : {}),
    }),
    youtube: Object.freeze({
      publicationVerified: parsed.YOUTUBE_PUBLICATION_VERIFIED,
      ...(enabled.youtube && parsed.YOUTUBE_CHANNEL_ID
        ? { channelId: parsed.YOUTUBE_CHANNEL_ID }
        : {}),
      ...(enabled.youtube && parsed.YOUTUBE_CLIENT_ID
        ? { clientId: parsed.YOUTUBE_CLIENT_ID }
        : {}),
      ...(enabled.youtube && parsed.YOUTUBE_CLIENT_SECRET
        ? { clientSecret: parsed.YOUTUBE_CLIENT_SECRET }
        : {}),
      ...(enabled.youtube && parsed.YOUTUBE_REFRESH_TOKEN
        ? { refreshToken: parsed.YOUTUBE_REFRESH_TOKEN }
        : {}),
    }),
    github: Object.freeze({
      ...(parsed.GITHUB_REPOSITORY
        ? { repository: parsed.GITHUB_REPOSITORY }
        : {}),
      ...(parsed.GITHUB_TOKEN ? { token: parsed.GITHUB_TOKEN } : {}),
    }),
    origins: Object.freeze({
      buffer: "https://api.buffer.com" as const,
      googleOauth: "https://oauth2.googleapis.com" as const,
      googleApis: "https://www.googleapis.com" as const,
      pages: parsed.PAGES_ORIGIN.replace(/\/$/, ""),
    }),
  });
}
