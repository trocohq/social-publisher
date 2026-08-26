import { rollingLocalDates } from "../shared/time.js";

export function datesNeedingPlans(
  now: Date,
  existingDates: readonly string[],
): string[] {
  for (const date of existingDates) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      throw new Error(`Invalid existing date: ${date}`);
    }
  }

  const existing = new Set(existingDates);
  return rollingLocalDates(now, 7).filter((date) => !existing.has(date));
}
