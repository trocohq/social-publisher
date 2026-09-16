export type StaticCycleMode = "scheduled" | "reconcile-only";
export type PendingStaticIntent = Readonly<{ opaqueId: string }>;
export type ApprovedStaticTarget = Readonly<{
  opaqueId: string;
  accountChannelKey: string;
  decision: "ready" | "held";
}>;
export type StaticCycleSummary = Readonly<{
  reconciled: number;
  uncertain: number;
  accepted: number;
  held: number;
  failed: number;
}>;

export async function runStaticEditorialCycle(
  input: Readonly<{
    mode: StaticCycleMode;
    pending: readonly PendingStaticIntent[];
    approved: readonly ApprovedStaticTarget[];
    reconcile(item: PendingStaticIntent): Promise<"reconciled" | "uncertain">;
    schedule(item: ApprovedStaticTarget): Promise<"accepted" | "uncertain">;
  }>,
): Promise<StaticCycleSummary> {
  const summary = {
    reconciled: 0,
    uncertain: 0,
    accepted: 0,
    held: 0,
    failed: 0,
  };
  for (const item of input.pending) {
    try {
      const outcome = await input.reconcile(item);
      summary[outcome] += 1;
    } catch {
      summary.failed += 1;
    }
  }
  if (input.mode === "reconcile-only") return summary;

  const selected = new Set<string>();
  for (const item of input.approved) {
    if (item.decision === "held" || selected.has(item.accountChannelKey)) {
      summary.held += 1;
      continue;
    }
    selected.add(item.accountChannelKey);
    try {
      const outcome = await input.schedule(item);
      summary[outcome] += 1;
    } catch {
      summary.failed += 1;
    }
  }
  return summary;
}
