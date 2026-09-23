import {
  createPlatformPublisher,
  type PlatformSubmissionOutcome,
} from "@trebla/publishing";
import { z } from "zod";
import { campaignStateSchema, type CampaignState } from "../state/schema.js";
import { toPlatformShadowEnvelope } from "./platform-envelope.js";
import {
  checkpointMedia,
  platformFilePaths,
  verifyPlatformMedia,
} from "./platform-media.js";
export { capturePlatformMedia } from "./platform-media.js";

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
  let failureCode = "PUBLISHING_SHADOW_CONFIGURATION_INVALID";
  try {
    const parsed = configurationSchema.safeParse({
      endpoint: input.environment.PUBLISHING_ENDPOINT,
      clientId: input.environment.PUBLISHING_CLIENT_ID,
      secret: input.environment.PUBLISHING_CLIENT_SECRET,
    });
    if (!parsed.success)
      throw new Error("Invalid publishing shadow configuration");
    failureCode = "PUBLISHING_SHADOW_MEDIA_INVALID";
    const state = campaignStateSchema.parse(input.state);
    const media = state.platformMedia
      ? checkpointMedia(state)
      : await verifyPlatformMedia(state, input.renderRoot);
    const envelope = toPlatformShadowEnvelope({ state, media });
    const paths = platformFilePaths(state, input.renderRoot);
    const uploads = envelope.artifacts.map((reference, index) => ({
      reference,
      filePath: paths[index]!,
    }));
    failureCode = "PUBLISHING_SHADOW_SUBMISSION_FAILED";
    const publisher = createPlatformPublisher({
      outboxDirectory: input.outboxDirectory,
      transport: {
        baseUrl: parsed.data.endpoint,
        clientId: parsed.data.clientId,
        secret: parsed.data.secret,
        fetch: async (url, init) => {
          const response = await (input.fetchImplementation ?? fetch)(
            url,
            init,
          );
          if (
            state.platformMedia &&
            init?.method === "POST" &&
            response.status === 409
          ) {
            const body = (await response
              .clone()
              .json()
              .catch(() => null)) as { code?: string } | null;
            if (body?.code === "ARTIFACT_NOT_READY") {
              failureCode = "PUBLISHING_SHADOW_MEDIA_INVALID";
              await verifyPlatformMedia(state, input.renderRoot);
              failureCode = "PUBLISHING_SHADOW_SUBMISSION_FAILED";
            }
          }
          return response;
        },
      },
    });
    return await publisher.submit({ envelope, uploads });
  } catch {
    // Filesystem and transport errors can include local paths or credentials.
    // Only fixed, locally selected codes may reach the CLI's error output.
    throw new Error(`Platform shadow failed (${failureCode})`);
  }
}
