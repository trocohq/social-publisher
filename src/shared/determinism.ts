import { createHash } from "node:crypto";

export function sha256(value: string | Buffer): string {
  return createHash("sha256").update(value).digest("hex");
}

export function normalizeCopy(value: string): string {
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

export function fingerprintCopy(value: string): string {
  return sha256(normalizeCopy(value));
}

export function chooseSeeded<T>(
  values: readonly T[],
  seed: string,
  offset: number,
): T {
  if (values.length === 0) {
    throw new Error("Cannot choose from an empty collection");
  }
  if (!Number.isInteger(offset) || offset < 0) {
    throw new Error("Seed offset must be a non-negative integer");
  }

  const index =
    Number.parseInt(sha256(`${seed}:${offset}`).slice(0, 8), 16) %
    values.length;
  return values[index]!;
}

export function campaignId(
  date: string,
  family: string,
  version: number,
  candidate: number,
): string {
  return `${date}-${family.replaceAll("_", "-")}-v${version}-${candidate}`;
}
