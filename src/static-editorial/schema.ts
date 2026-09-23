import { z } from "zod";

const IDENTIFIER = /^troco-[a-z0-9]+(?:-[a-z0-9]+)*$/u;
const TIMESTAMP_WITH_SECONDS_AND_OFFSET =
  /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})([+-]\d{2}:\d{2})$/u;

function isSaoPauloTimestamp(value: string): boolean {
  const match = TIMESTAMP_WITH_SECONDS_AND_OFFSET.exec(value);
  if (!match) return false;
  const instant = new Date(value);
  if (!Number.isFinite(instant.valueOf())) return false;
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  });
  const parts = Object.fromEntries(
    formatter.formatToParts(instant).map((part) => [part.type, part.value]),
  );
  return (
    `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}:${parts.second}` ===
    `${match[1]}-${match[2]}-${match[3]}T${match[4]}:${match[5]}:${match[6]}`
  );
}

const ChannelSchema = z.strictObject({
  channel: z.enum(["instagram", "facebook"]),
  placement: z.enum(["feed", "story"]),
  publishAt: z
    .string()
    .refine(isSaoPauloTimestamp, "Invalid São Paulo timestamp"),
  copy: z.string().min(1).max(10_000),
});

const SlideSchema = z.strictObject({
  role: z.enum(["cover", "content", "closing"]),
  title: z.string().min(1).max(240),
  body: z.string().min(1).max(2_000),
  alt: z.string().min(1).max(1_000),
});

const SourceSchema = z.strictObject({
  label: z.string().min(1).max(240),
  url: z.url(),
});

export const StaticEditorialEntrySchema = z
  .strictObject({
    schemaVersion: z.literal(1),
    id: z.string().regex(IDENTIFIER),
    brand: z.literal("troco"),
    format: z.enum(["image", "carousel"]),
    timeZone: z.literal("America/Sao_Paulo"),
    channels: z.array(ChannelSchema).min(1).max(6),
    slides: z.array(SlideSchema).min(1).max(5),
    sources: z.array(SourceSchema).max(20).optional(),
  })
  .superRefine((entry, context) => {
    const targets = new Set<string>();
    for (const target of entry.channels) {
      const key = `${target.channel}:${target.placement}`;
      if (targets.has(key)) {
        context.addIssue({
          code: "custom",
          message: `Duplicate target ${key}`,
        });
      }
      targets.add(key);
    }
    if (entry.format === "image" && entry.slides.length !== 1) {
      context.addIssue({
        code: "custom",
        message: "Image entries require one slide",
      });
    }
    if (entry.format === "carousel" && entry.slides.length < 2) {
      context.addIssue({
        code: "custom",
        message: "Carousel entries require at least two slides",
      });
    }
  });

export type StaticEditorialEntry = z.infer<typeof StaticEditorialEntrySchema>;
