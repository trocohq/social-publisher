type CapacityEntry = Readonly<{
  providerId: string;
  status: "scheduled" | "processing" | "published";
}>;
type CapacityEvidence = Readonly<{
  accountRef: string;
  connected: boolean;
  paginationComplete: boolean;
  observedAt: string;
  validUntil: string;
  limit: number;
  entries: readonly CapacityEntry[];
}>;
type ResourceEvidence = Readonly<{
  verifiedAt: string;
  validUntil: string;
  runnerMinutesRemaining: number;
  storageBytesRemaining: number;
  requiredRunnerMinutes: number;
  requiredStorageBytes: number;
}>;
type Reservation = Readonly<{ logicalKey: string; providerId?: string }>;

export function evaluateStaticCapacity(
  input: Readonly<{
    now: string;
    expectedAccountRef: string;
    evidence: CapacityEvidence;
    resources: ResourceEvidence;
    reservations: readonly Reservation[];
    requestedSlots: number;
  }>,
): Readonly<
  | { kind: "available"; remainingSlots: number }
  | { kind: "held"; reason: string }
> {
  const now = Date.parse(input.now);
  if (
    !Number.isFinite(now) ||
    !Number.isSafeInteger(input.evidence.limit) ||
    input.evidence.limit < 0 ||
    !Number.isSafeInteger(input.requestedSlots) ||
    input.requestedSlots < 1
  )
    throw new Error("STATIC_CAPACITY_INVALID");
  if (!input.evidence.connected)
    return { kind: "held", reason: "STATIC_ACCOUNT_DISCONNECTED" };
  if (input.evidence.accountRef !== input.expectedAccountRef)
    return { kind: "held", reason: "STATIC_ACCOUNT_MISMATCH" };
  if (!input.evidence.paginationComplete)
    return { kind: "held", reason: "STATIC_CAPACITY_INCOMPLETE" };
  if (Date.parse(input.evidence.validUntil) < now)
    return { kind: "held", reason: "STATIC_CAPACITY_STALE" };
  if (Date.parse(input.resources.validUntil) < now)
    return { kind: "held", reason: "STATIC_FREE_RESOURCE_STALE" };
  if (
    input.resources.runnerMinutesRemaining <
      input.resources.requiredRunnerMinutes ||
    input.resources.storageBytesRemaining < input.resources.requiredStorageBytes
  )
    return { kind: "held", reason: "STATIC_FREE_RESOURCE_EXHAUSTED" };
  const observedIds = new Set(
    input.evidence.entries.map((entry) => entry.providerId),
  );
  const unseenReservations = input.reservations.filter(
    (reservation) =>
      !reservation.providerId || !observedIds.has(reservation.providerId),
  ).length;
  const remainingSlots =
    input.evidence.limit -
    input.evidence.entries.length -
    unseenReservations -
    input.requestedSlots;
  return remainingSlots < 0
    ? { kind: "held", reason: "STATIC_CAPACITY_EXHAUSTED" }
    : { kind: "available", remainingSlots };
}
