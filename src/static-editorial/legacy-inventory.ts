type LegacyChannel = "facebook" | "youtube" | "instagram" | "tiktok";
type SourceMediaKind = "feed" | "carousel" | "video" | "unknown";
export type LegacyDeliveryRecord = Readonly<{
  campaignId: string;
  channel: LegacyChannel;
  providerId: string;
  mediaClass: "static" | "video" | "unknown";
  sourceMediaKind: SourceMediaKind;
}>;

function object(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

export function classifyLegacyDelivery(
  stateValue: unknown,
  channel: LegacyChannel,
): LegacyDeliveryRecord | null {
  const state = object(stateValue);
  const plan = object(state?.plan);
  const channels = object(state?.channels);
  const delivery = object(channels?.[channel]);
  const lastError = object(delivery?.lastError);
  if (
    typeof plan?.id !== "string" ||
    !plan.id.trim() ||
    delivery?.stage !== "failed" ||
    typeof delivery.providerId !== "string" ||
    !delivery.providerId.trim() ||
    lastError?.category !== "buffer_async_failure"
  )
    return null;

  const sourceMediaKind: SourceMediaKind =
    plan.mediaKind === "feed" ||
    plan.mediaKind === "carousel" ||
    plan.mediaKind === "video"
      ? plan.mediaKind
      : "unknown";
  let mediaClass: LegacyDeliveryRecord["mediaClass"] = "unknown";
  if (sourceMediaKind !== "unknown") {
    if (channel === "youtube" || channel === "tiktok") mediaClass = "video";
    else mediaClass = sourceMediaKind === "video" ? "video" : "static";
  }
  return {
    campaignId: plan.id,
    channel,
    providerId: delivery.providerId,
    mediaClass,
    sourceMediaKind,
  };
}

export function buildLegacyDeliveryInventory(
  states: readonly unknown[],
): Readonly<{
  counts: Readonly<Record<"static" | "video" | "unknown", number>>;
  records: readonly LegacyDeliveryRecord[];
}> {
  const records: LegacyDeliveryRecord[] = [];
  for (const state of states) {
    for (const channel of [
      "facebook",
      "youtube",
      "instagram",
      "tiktok",
    ] as const) {
      const record = classifyLegacyDelivery(state, channel);
      if (record) records.push(record);
    }
  }
  return {
    counts: {
      static: records.filter(({ mediaClass }) => mediaClass === "static")
        .length,
      video: records.filter(({ mediaClass }) => mediaClass === "video").length,
      unknown: records.filter(({ mediaClass }) => mediaClass === "unknown")
        .length,
    },
    records,
  };
}
