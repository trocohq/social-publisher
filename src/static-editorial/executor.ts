export type StaticIntent = Readonly<{
  logicalKey: string;
  fence: number;
  envelopeSha256: `sha256:${string}`;
  envelope: unknown;
}>;

type StoredIntent = StaticIntent &
  Readonly<{ state: "intent" | "uncertain" | "accepted" }>;
type CreateResult = Readonly<{ kind: "accepted"; providerId: string }>;
type ReconcileResult = Readonly<
  | { kind: "missing" }
  | {
      kind: "found";
      providerId: string;
      status: "scheduled" | "processing" | "published";
    }
>;

export interface StaticExecutionStore {
  claim(logicalKey: string, fence: number): Promise<boolean>;
  read(logicalKey: string): Promise<StoredIntent | null>;
  persistIntent(intent: StaticIntent): Promise<void>;
  persistOutcome(
    logicalKey: string,
    outcome: "accepted" | "uncertain",
    providerId?: string,
  ): Promise<void>;
}

export async function executeStaticIntent(
  input: Readonly<{
    intent: StaticIntent;
    store: StaticExecutionStore;
    transport: Readonly<{
      create(envelope: unknown): Promise<CreateResult>;
      reconcile(intent: StaticIntent): Promise<ReconcileResult>;
    }>;
  }>,
): Promise<CreateResult | ReconcileResult | Readonly<{ kind: "uncertain" }>> {
  if (!(await input.store.claim(input.intent.logicalKey, input.intent.fence)))
    throw new Error("STATIC_EXECUTION_NOT_OWNER");
  const stored = await input.store.read(input.intent.logicalKey);
  if (
    stored &&
    (stored.envelopeSha256 !== input.intent.envelopeSha256 ||
      JSON.stringify(stored.envelope) !== JSON.stringify(input.intent.envelope))
  )
    throw new Error("STATIC_EXECUTION_INTENT_MISMATCH");
  if (stored?.state === "uncertain" || stored?.state === "accepted")
    return input.transport.reconcile(input.intent);
  if (!stored) await input.store.persistIntent(input.intent);
  try {
    const result = await input.transport.create(
      structuredClone(input.intent.envelope),
    );
    await input.store.persistOutcome(
      input.intent.logicalKey,
      "accepted",
      result.providerId,
    );
    return result;
  } catch {
    await input.store.persistOutcome(input.intent.logicalKey, "uncertain");
    return { kind: "uncertain" };
  }
}
