export type StaticCutoverRecord = Readonly<{
  logicalKey: string;
  owner: "legacy" | "static";
  state: string;
  media: "static" | "video" | "unknown";
  providerId?: string;
  mediaAvailable: boolean;
  approvalValid: boolean;
}>;

function counts(values: readonly string[]): Record<string, number> {
  const result: Record<string, number> = {};
  for (const value of values) result[value] = (result[value] ?? 0) + 1;
  return result;
}

export function buildStaticCutoverRehearsal(
  records: readonly StaticCutoverRecord[],
) {
  const identities = new Map<string, Set<string>>();
  for (const record of records) {
    const values = identities.get(record.logicalKey) ?? new Set<string>();
    values.add(`${record.owner}:${record.providerId ?? "none"}`);
    identities.set(record.logicalKey, values);
  }
  return {
    total: records.length,
    byOwner: counts(records.map(({ owner }) => owner)),
    byState: counts(records.map(({ state }) => state)),
    byMedia: {
      static: records.filter(({ media }) => media === "static").length,
      video: records.filter(({ media }) => media === "video").length,
      unknown: records.filter(({ media }) => media === "unknown").length,
    },
    conflictingLogicalKeys: [...identities]
      .filter(([, values]) => values.size > 1)
      .map(([key]) => key)
      .sort(),
    ambiguous: records.filter(({ state }) => state === "uncertain").length,
    missingMedia: records.filter(({ mediaAvailable }) => !mediaAvailable)
      .length,
    invalidApprovals: records.filter(({ approvalValid }) => !approvalValid)
      .length,
    queueDemand: records.filter(({ state }) =>
      ["approved", "intent", "accepted", "scheduled", "processing"].includes(
        state,
      ),
    ).length,
  };
}

export function decideStaticCutover(
  input: Readonly<{
    oldCreationFrozen: boolean;
    pendingReconciled: boolean;
    ownerFencePersisted: boolean;
    executorEnabled: boolean;
  }>,
): Readonly<
  | { kind: "blocked"; reason: string }
  | { kind: "ready-to-enable" }
  | { kind: "active" }
> {
  if (!input.oldCreationFrozen)
    return { kind: "blocked", reason: "STATIC_CUTOVER_LEGACY_NOT_FROZEN" };
  if (!input.pendingReconciled)
    return {
      kind: "blocked",
      reason: "STATIC_CUTOVER_PENDING_RECONCILIATION",
    };
  if (!input.ownerFencePersisted)
    return { kind: "blocked", reason: "STATIC_CUTOVER_FENCE_MISSING" };
  return input.executorEnabled
    ? { kind: "active" }
    : { kind: "ready-to-enable" };
}

export function planStaticRollback() {
  return {
    stopNewCreation: true,
    preserveProviderIds: true,
    reconcileExisting: true,
    reenableLegacyCreation: false,
  } as const;
}
