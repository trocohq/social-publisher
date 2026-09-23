export type StaticState =
  | "approved"
  | "held"
  | "intent"
  | "accepted"
  | "scheduled"
  | "processing"
  | "uncertain"
  | "published"
  | "failed";

export function selectStaticAction(
  input: Readonly<{
    now: Date;
    publishAt: string;
    state: StaticState;
    hasAttempt: boolean;
    hasProviderId: boolean;
    hasPlatformId: boolean;
  }>,
): "none" | "reconcile" | "hold" | "preflight" {
  if (input.state === "published") return "none";
  if (input.hasAttempt || input.hasProviderId || input.hasPlatformId)
    return "reconcile";
  if (input.state !== "approved") return "none";
  const due = Date.parse(input.publishAt);
  if (!Number.isFinite(due) || Number.isNaN(input.now.valueOf()))
    throw new Error("STATIC_TIME_INVALID");
  if (due <= input.now.valueOf()) return "hold";
  return due <= input.now.valueOf() + 24 * 60 * 60_000 ? "preflight" : "none";
}
