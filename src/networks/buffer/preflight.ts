import { bufferGraphql } from "./graphql.js";
import { listBufferPosts } from "./list-posts.js";

export type BufferChannelCapability = Readonly<{
  id: string;
  service: "instagram" | "facebook" | "tiktok";
  organizationId: string;
  isQueuePaused: boolean;
}>;

export function assertBufferPreflight({
  organizationId,
  expectedChannelIds,
  channels,
  scheduledPostCounts,
  requiredSlots,
}: Readonly<{
  organizationId: string;
  expectedChannelIds: Readonly<
    Record<"instagram" | "facebook" | "tiktok", string>
  >;
  channels: readonly BufferChannelCapability[];
  scheduledPostCounts: Readonly<
    Record<"instagram" | "facebook" | "tiktok", number>
  >;
  requiredSlots: Readonly<Record<"instagram" | "facebook" | "tiktok", number>>;
}>): void {
  if (channels.length !== 3)
    throw new Error("Buffer must return exactly three channels");
  for (const service of ["instagram", "facebook", "tiktok"] as const) {
    const matches = channels.filter(
      (channel) =>
        channel.id === expectedChannelIds[service] &&
        channel.service === service,
    );
    if (matches.length !== 1)
      throw new Error(`Buffer ${service} channel mismatch`);
    const channel = matches[0]!;
    if (channel.organizationId !== organizationId) {
      throw new Error("Buffer organization mismatch");
    }
    if (channel.isQueuePaused)
      throw new Error(`Buffer ${service} channel is paused`);
    if (scheduledPostCounts[service] + requiredSlots[service] > 10) {
      throw new Error(
        `Buffer ${service} queue would exceed 10 scheduled posts`,
      );
    }
  }
}

const CHANNELS_QUERY = `query TrocoChannels($input: ChannelsInput!) {
  channels(input: $input) {
    id service organizationId isQueuePaused
  }
}`;

export async function runBufferPreflight({
  apiKey,
  organizationId,
  expectedChannelIds,
  requiredSlots = { instagram: 0, facebook: 0, tiktok: 0 },
  fetchImplementation,
}: Readonly<{
  apiKey: string;
  organizationId: string;
  expectedChannelIds: Readonly<
    Partial<Record<"instagram" | "facebook" | "tiktok", string>>
  >;
  requiredSlots?: Readonly<Record<"instagram" | "facebook" | "tiktok", number>>;
  fetchImplementation?: typeof fetch;
}>): Promise<void> {
  const completeExpectedChannelIds = Object.fromEntries(
    (["instagram", "facebook", "tiktok"] as const).map((service) => {
      const channelId = expectedChannelIds[service];
      if (!channelId) {
        throw new Error("Buffer preflight requires exactly three channels");
      }
      return [service, channelId];
    }),
  ) as Record<"instagram" | "facebook" | "tiktok", string>;
  const channelResponse = await bufferGraphql<{
    channels: BufferChannelCapability[];
  }>({
    apiKey,
    query: CHANNELS_QUERY,
    variables: { input: { organizationId } },
    ...(fetchImplementation ? { fetchImplementation } : {}),
  });
  if (channelResponse.kind !== "success") {
    throw Object.assign(new Error(channelResponse.message), channelResponse);
  }
  const channelIds = Object.values(completeExpectedChannelIds);
  const postResponse = await listBufferPosts({
    apiKey,
    organizationId,
    channelIds,
    statuses: ["scheduled"],
    operationName: "TrocoScheduledPosts",
    ...(fetchImplementation ? { fetchImplementation } : {}),
  });
  if (postResponse.kind !== "success") {
    throw Object.assign(new Error(postResponse.message), postResponse);
  }
  const scheduledPostCounts = {
    instagram: postResponse.value.filter(
      (post) => post.channelId === expectedChannelIds.instagram,
    ).length,
    facebook: postResponse.value.filter(
      (post) => post.channelId === expectedChannelIds.facebook,
    ).length,
    tiktok: postResponse.value.filter(
      (post) => post.channelId === expectedChannelIds.tiktok,
    ).length,
  };
  assertBufferPreflight({
    organizationId,
    expectedChannelIds: completeExpectedChannelIds,
    channels: channelResponse.value.channels,
    scheduledPostCounts,
    requiredSlots,
  });
}
