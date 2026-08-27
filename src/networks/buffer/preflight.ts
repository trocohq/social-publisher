import {
  bufferChannels,
  type BufferChannelName,
} from "../../config/channels.js";
import { bufferGraphql } from "./graphql.js";
import { listBufferPosts } from "./list-posts.js";

export type BufferChannelCapability = Readonly<{
  id: string;
  service: "instagram" | "facebook" | "tiktok" | "youtube";
  serviceId?: string;
  organizationId: string;
  isQueuePaused: boolean;
  isDisconnected?: boolean;
  isLocked?: boolean;
}>;

export function assertBufferPreflight({
  organizationId,
  expectedChannelIds,
  expectedServiceIds = {},
  channels,
  scheduledPostCounts,
  requiredSlots,
}: Readonly<{
  organizationId: string;
  expectedChannelIds: Readonly<Partial<Record<BufferChannelName, string>>>;
  expectedServiceIds?: Readonly<Partial<Record<BufferChannelName, string>>>;
  channels: readonly BufferChannelCapability[];
  scheduledPostCounts: Readonly<Record<BufferChannelName, number>>;
  requiredSlots: Readonly<Record<BufferChannelName, number>>;
}>): void {
  const expectedEntries = bufferChannels.flatMap((service) => {
    const id = expectedChannelIds[service];
    return id ? [[service, id] as const] : [];
  });
  if (expectedEntries.length === 0) {
    throw new Error("Buffer preflight requires an enabled channel");
  }
  for (const [service, expectedId] of expectedEntries) {
    const matches = channels.filter(
      (channel) => channel.id === expectedId && channel.service === service,
    );
    if (matches.length !== 1)
      throw new Error(`Buffer ${service} channel mismatch`);
    const channel = matches[0]!;
    if (channel.organizationId !== organizationId) {
      throw new Error("Buffer organization mismatch");
    }
    if (
      expectedServiceIds[service] &&
      channel.serviceId !== expectedServiceIds[service]
    ) {
      throw new Error(`Buffer ${service} account mismatch`);
    }
    if (channel.isDisconnected || channel.isLocked) {
      throw new Error(`Buffer ${service} channel is unavailable`);
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
    id service serviceId organizationId isQueuePaused isDisconnected isLocked
  }
}`;

export async function runBufferPreflight({
  apiKey,
  organizationId,
  expectedChannelIds,
  expectedServiceIds = {},
  requiredSlots = { instagram: 0, facebook: 0, tiktok: 0, youtube: 0 },
  fetchImplementation,
}: Readonly<{
  apiKey: string;
  organizationId: string;
  expectedChannelIds: Readonly<Partial<Record<BufferChannelName, string>>>;
  expectedServiceIds?: Readonly<Partial<Record<BufferChannelName, string>>>;
  requiredSlots?: Readonly<Record<BufferChannelName, number>>;
  fetchImplementation?: typeof fetch;
}>): Promise<void> {
  const expectedEntries = bufferChannels.flatMap((service) => {
    const id = expectedChannelIds[service];
    return id ? [[service, id] as const] : [];
  });
  if (expectedEntries.length === 0) {
    throw new Error("Buffer preflight requires an enabled channel");
  }
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
  const channelIds = expectedEntries.map(([, id]) => id);
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
  const scheduledPostCounts = Object.fromEntries(
    bufferChannels.map((service) => {
      const expectedId = expectedChannelIds[service];
      return [
        service,
        expectedId
          ? postResponse.value.filter((post) => post.channelId === expectedId)
              .length
          : 0,
      ];
    }),
  ) as Record<BufferChannelName, number>;
  assertBufferPreflight({
    organizationId,
    expectedChannelIds,
    expectedServiceIds,
    channels: channelResponse.value.channels,
    scheduledPostCounts,
    requiredSlots,
  });
}
