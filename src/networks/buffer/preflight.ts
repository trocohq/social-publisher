import { bufferGraphql } from "./graphql.js";

export type BufferChannelCapability = Readonly<{
  id: string;
  service: "instagram" | "facebook" | "tiktok";
  paused: boolean;
  scheduledPostCount: number;
}>;

export function assertBufferPreflight({
  organizationId,
  returnedOrganizationId,
  expectedChannelIds,
  channels,
  planningWindow = 7,
}: Readonly<{
  organizationId: string;
  returnedOrganizationId: string;
  expectedChannelIds: Readonly<
    Record<"instagram" | "facebook" | "tiktok", string>
  >;
  channels: readonly BufferChannelCapability[];
  planningWindow?: number;
}>): void {
  if (organizationId !== returnedOrganizationId) {
    throw new Error("Buffer organization mismatch");
  }
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
    if (channel.paused) throw new Error(`Buffer ${service} channel is paused`);
    if (channel.scheduledPostCount + planningWindow > 10) {
      throw new Error(
        `Buffer ${service} queue would exceed 10 scheduled posts`,
      );
    }
  }
}

const PREFLIGHT_QUERY = `query TrocoPreflight($organizationId: ID!) {
  organization(id: $organizationId) {
    id
    channels { id service paused scheduledPostCount }
  }
}`;

export async function runBufferPreflight({
  apiKey,
  organizationId,
  expectedChannelIds,
  fetchImplementation,
}: Readonly<{
  apiKey: string;
  organizationId: string;
  expectedChannelIds: Readonly<
    Record<"instagram" | "facebook" | "tiktok", string>
  >;
  fetchImplementation?: typeof fetch;
}>): Promise<void> {
  const response = await bufferGraphql<{
    organization: { id: string; channels: BufferChannelCapability[] };
  }>({
    apiKey,
    query: PREFLIGHT_QUERY,
    variables: { organizationId },
    ...(fetchImplementation ? { fetchImplementation } : {}),
  });
  if (response.kind !== "success") {
    throw Object.assign(new Error(response.message), response);
  }
  assertBufferPreflight({
    organizationId,
    returnedOrganizationId: response.value.organization.id,
    expectedChannelIds,
    channels: response.value.organization.channels,
  });
}
