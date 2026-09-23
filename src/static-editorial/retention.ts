type Consumer = Readonly<{
  logicalKey: string;
  state:
    | "approved"
    | "held"
    | "intent"
    | "accepted"
    | "scheduled"
    | "processing"
    | "uncertain"
    | "published"
    | "failed";
  ingestedAssetHashes?: readonly string[];
}>;

export function mayDeleteStaticMedia(
  input: Readonly<{
    now: string;
    assetHashes: readonly string[];
    retainUntil: string;
    consumers: readonly Consumer[];
  }>,
): boolean {
  const now = Date.parse(input.now);
  const retainUntil = Date.parse(input.retainUntil);
  if (
    !Number.isFinite(now) ||
    !Number.isFinite(retainUntil) ||
    input.assetHashes.length === 0 ||
    input.consumers.length === 0 ||
    now < retainUntil
  )
    return false;
  return input.consumers.every(
    (consumer) =>
      consumer.state === "published" &&
      arraysEqual(consumer.ingestedAssetHashes, input.assetHashes),
  );
}

function arraysEqual(
  left: readonly string[] | undefined,
  right: readonly string[],
): boolean {
  return (
    left !== undefined &&
    left.length === right.length &&
    left.every((value, index) => value === right[index])
  );
}
