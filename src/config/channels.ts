export const publicationChannels = [
  "instagram",
  "facebook",
  "tiktok",
  "youtube",
] as const;

export const bufferChannels = ["instagram", "facebook", "tiktok"] as const;

export type PublicationChannelName = (typeof publicationChannels)[number];
export type BufferChannelName = (typeof bufferChannels)[number];
export type ChannelEnablement = Readonly<
  Record<PublicationChannelName, boolean>
>;

export function enabledPublicationChannels(
  enabled: ChannelEnablement,
): readonly PublicationChannelName[] {
  return publicationChannels.filter((channel) => enabled[channel]);
}

export function enabledBufferChannels(
  enabled: ChannelEnablement,
): readonly BufferChannelName[] {
  return bufferChannels.filter((channel) => enabled[channel]);
}
