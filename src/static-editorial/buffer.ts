import {
  validatePublicationEnvelope,
  type PublicationEnvelope,
} from "@trebla/publishing";

import {
  createBufferPostInput,
  type BufferPostInput,
} from "../networks/buffer/posts.js";

type Accepted = Readonly<{ kind: "accepted"; providerId: string }>;

function stringOption(options: Record<string, unknown>, key: string): string {
  const value = options[key];
  if (typeof value !== "string" || !value.trim())
    throw new Error("STATIC_BUFFER_INTENT_INVALID");
  return value;
}

export function createStaticBufferAdapter(
  transport: Readonly<{
    create(input: BufferPostInput): Promise<Accepted>;
  }>,
) {
  return {
    async create(
      envelopeValue: PublicationEnvelope,
      deliveryId: string,
    ): Promise<Accepted> {
      const envelope = validatePublicationEnvelope(envelopeValue);
      const delivery = envelope.deliveries.find(
        (item) => item.id === deliveryId,
      );
      if (
        !delivery ||
        delivery.adapter !== "social.buffer" ||
        delivery.payload.type !== "social.post"
      )
        throw new Error("STATIC_BUFFER_DELIVERY_INVALID");
      const options = delivery.providerOptions ?? {};
      if (options.mode !== "customScheduled")
        throw new Error("STATIC_BUFFER_SCHEDULE_REQUIRED");
      if (options.placement !== "feed")
        throw new Error("STATIC_BUFFER_PLACEMENT_UNSUPPORTED");
      const channel = stringOption(options, "channel");
      if (channel !== "instagram" && channel !== "facebook")
        throw new Error("STATIC_BUFFER_CHANNEL_UNSUPPORTED");
      const artifactIds = delivery.payload.artifactIds;
      if (!Array.isArray(artifactIds))
        throw new Error("STATIC_BUFFER_MEDIA_INVALID");
      const byId = new Map(
        envelope.artifacts.map((artifact) => [artifact.id, artifact]),
      );
      const mediaUrls = artifactIds.map((id) => {
        if (typeof id !== "string")
          throw new Error("STATIC_BUFFER_MEDIA_INVALID");
        const artifact = byId.get(id);
        if (!artifact || artifact.mediaType !== "image/jpeg")
          throw new Error("STATIC_BUFFER_MEDIA_INVALID");
        return artifact.locator;
      });
      const text = delivery.payload.text;
      if (typeof text !== "string")
        throw new Error("STATIC_BUFFER_INTENT_INVALID");
      const postInput = createBufferPostInput({
        channel,
        channelId: stringOption(options, "expectedAccountId"),
        text,
        dueAt: stringOption(options, "dueAt"),
        phase: "scheduling",
        mediaKind: mediaUrls.length === 1 ? "feed" : "carousel",
        mediaUrls,
      });
      return transport.create(postInput);
    },
  };
}
