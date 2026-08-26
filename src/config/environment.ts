import { z } from "zod";

const shaSchema = z.string().regex(/^[a-f0-9]{40}$/);
const nonEmpty = z.string().min(1);
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
const timeZoneSchema = z.string().refine((value) => {
  try {
    new Intl.DateTimeFormat("en", { timeZone: value }).format();
    return true;
  } catch {
    return false;
  }
});

const environmentSchema = z.object({
  AUTO_PUBLISH: z
    .enum(["true", "false"])
    .default("false")
    .transform((value) => value === "true"),
  PUBLICATION_TIME_ZONE: timeZoneSchema,
  PUBLISH_TIME: z.string().regex(/^(?:[01]\d|2[0-3]):[0-5]\d$/),
  PAGES_ORIGIN: httpsUrl,
  BUFFER_ORGANIZATION_ID: nonEmpty,
  BUFFER_INSTAGRAM_CHANNEL_ID: nonEmpty,
  BUFFER_FACEBOOK_CHANNEL_ID: nonEmpty,
  BUFFER_TIKTOK_CHANNEL_ID: nonEmpty,
  YOUTUBE_CHANNEL_ID: nonEmpty,
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
  BUFFER_API_KEY: nonEmpty.optional(),
  YOUTUBE_CLIENT_ID: nonEmpty.optional(),
  YOUTUBE_CLIENT_SECRET: nonEmpty.optional(),
  YOUTUBE_REFRESH_TOKEN: nonEmpty.optional(),
  GITHUB_REPOSITORY: z
    .string()
    .regex(/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/)
    .optional(),
  GITHUB_TOKEN: nonEmpty.optional(),
});

export type EnvironmentPurpose = "planning" | "provider" | "incident";

export type PublisherEnvironment = Readonly<{
  autoPublish: boolean;
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
    organizationId: string;
    channelIds: Readonly<{
      instagram: string;
      facebook: string;
      tiktok: string;
    }>;
    apiKey?: string;
  }>;
  youtube: Readonly<{
    channelId: string;
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

  if (purpose === "provider") {
    requireFields(parsed, [
      "BUFFER_API_KEY",
      "YOUTUBE_CLIENT_ID",
      "YOUTUBE_CLIENT_SECRET",
      "YOUTUBE_REFRESH_TOKEN",
    ]);
  }
  if (purpose === "incident") {
    requireFields(parsed, ["GITHUB_REPOSITORY", "GITHUB_TOKEN"]);
  }

  return Object.freeze({
    autoPublish: parsed.AUTO_PUBLISH,
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
      organizationId: parsed.BUFFER_ORGANIZATION_ID,
      channelIds: Object.freeze({
        instagram: parsed.BUFFER_INSTAGRAM_CHANNEL_ID,
        facebook: parsed.BUFFER_FACEBOOK_CHANNEL_ID,
        tiktok: parsed.BUFFER_TIKTOK_CHANNEL_ID,
      }),
      ...(parsed.BUFFER_API_KEY ? { apiKey: parsed.BUFFER_API_KEY } : {}),
    }),
    youtube: Object.freeze({
      channelId: parsed.YOUTUBE_CHANNEL_ID,
      ...(parsed.YOUTUBE_CLIENT_ID
        ? { clientId: parsed.YOUTUBE_CLIENT_ID }
        : {}),
      ...(parsed.YOUTUBE_CLIENT_SECRET
        ? { clientSecret: parsed.YOUTUBE_CLIENT_SECRET }
        : {}),
      ...(parsed.YOUTUBE_REFRESH_TOKEN
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
