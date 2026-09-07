import { join } from "node:path";
import {
  createPlatformPublisher,
  prepareArtifactReference,
  type PlatformSubmissionOutcome,
} from "@trebla/publishing";
import { z } from "zod";
import { mediaRecordFromState } from "../media/manifest.js";
import { campaignStateSchema, type CampaignState } from "../state/schema.js";
import { toPlatformShadowEnvelope } from "./platform-envelope.js";

const configurationSchema = z.object({
  endpoint: z.string().refine((value) => {
    try {
      const url = new URL(value);
      return (
        url.protocol === "https:" &&
        !url.username &&
        !url.password &&
        !url.search &&
        !url.hash &&
        url.pathname === "/"
      );
    } catch {
      return false;
    }
  }),
  clientId: z.string().trim().min(1),
  secret: z
    .string()
    .min(1)
    .refine((value) => value.trim().length > 0),
});

export async function submitPlatformShadow(
  input: Readonly<{
    state: CampaignState;
    renderRoot: string;
    outboxDirectory: string;
    environment: Readonly<Record<string, string | undefined>>;
    dryRun?: boolean;
    fetchImplementation?: typeof fetch;
  }>,
): Promise<PlatformSubmissionOutcome | { outcome: "disabled" }> {
  if (input.dryRun || input.environment.PUBLISHING_SHADOW_ENABLED !== "true") {
    return { outcome: "disabled" };
  }
  const parsed = configurationSchema.safeParse({
    endpoint: input.environment.PUBLISHING_ENDPOINT,
    clientId: input.environment.PUBLISHING_CLIENT_ID,
    secret: input.environment.PUBLISHING_CLIENT_SECRET,
  });
  if (!parsed.success)
    throw new Error("Invalid publishing shadow configuration");
  const state = campaignStateSchema.parse(input.state);
  const media = mediaRecordFromState(state);
  // Producer output has kind subdirectories; the legacy flat handoff helper
  // is intentionally not used here. Validate every file before transport.
  const uploads = [];
  for (const asset of media.assets) {
    const filePath = join(
      input.renderRoot,
      media.localDate,
      media.campaignId,
      asset.kind,
      asset.filename,
    );
    const extension = asset.kind === "feed" ? "jpg" : "mp4";
    const reference = await prepareArtifactReference({
      id: `media-${asset.hash}`,
      filePath,
      storage: "r2-temporary",
      locator: `temporary/troco/${media.campaignId}/${asset.kind}/${asset.hash}.${extension}`,
      mediaType: asset.contentType,
      allowedMediaTypes: ["image/jpeg", "video/mp4"],
      maxByteSize: 50_000_000,
    });
    if (reference.sha256 !== asset.hash)
      throw new Error("Platform artifact does not match approved hash");
    asset.bytes = reference.byteSize;
    uploads.push({ reference, filePath });
  }
  const envelope = toPlatformShadowEnvelope({ state, media });
  const publisher = createPlatformPublisher({
    outboxDirectory: input.outboxDirectory,
    transport: {
      baseUrl: parsed.data.endpoint,
      clientId: parsed.data.clientId,
      secret: parsed.data.secret,
      ...(input.fetchImplementation
        ? { fetch: input.fetchImplementation }
        : {}),
    },
  });
  return publisher.submit({ envelope, uploads });
}
