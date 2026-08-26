export const DEFAULT_TIME_ZONE = "America/Sao_Paulo";

const localDateFormatters = new Map<string, Intl.DateTimeFormat>();

function localDateFormatter(timeZone: string): Intl.DateTimeFormat {
  const existing = localDateFormatters.get(timeZone);
  if (existing) return existing;

  const formatter = new Intl.DateTimeFormat("en-US", {
    day: "2-digit",
    month: "2-digit",
    timeZone,
    year: "numeric",
  });
  localDateFormatters.set(timeZone, formatter);
  return formatter;
}

function parseLocalDate(localDate: string): Date {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(localDate)) {
    throw new Error("Invalid local date");
  }

  const parsed = new Date(`${localDate}T12:00:00Z`);
  if (Number.isNaN(parsed.valueOf()) || parsed.toISOString().slice(0, 10) !== localDate) {
    throw new Error("Invalid local date");
  }
  return parsed;
}

export function localDateAt(
  instant: Date,
  timeZone = DEFAULT_TIME_ZONE,
): string {
  if (Number.isNaN(instant.valueOf())) throw new Error("Invalid instant");

  const values = Object.fromEntries(
    localDateFormatter(timeZone)
      .formatToParts(instant)
      .filter(({ type }) => type === "year" || type === "month" || type === "day")
      .map(({ type, value }) => [type, value]),
  );
  return `${values.year}-${values.month}-${values.day}`;
}

export function addCalendarDays(localDate: string, days: number): string {
  if (!Number.isInteger(days)) throw new Error("Calendar days must be an integer");
  const parsed = parseLocalDate(localDate);
  parsed.setUTCDate(parsed.getUTCDate() + days);
  return parsed.toISOString().slice(0, 10);
}

export function rollingLocalDates(
  now: Date,
  count: number,
  timeZone = DEFAULT_TIME_ZONE,
): string[] {
  if (!Number.isInteger(count) || count < 0) {
    throw new Error("Window count must be a non-negative integer");
  }
  const today = localDateAt(now, timeZone);
  return Array.from({ length: count }, (_, index) => addCalendarDays(today, index));
}

export function calendarDayDistance(left: string, right: string): number {
  const milliseconds = Math.abs(parseLocalDate(left).valueOf() - parseLocalDate(right).valueOf());
  return milliseconds / 86_400_000;
}
