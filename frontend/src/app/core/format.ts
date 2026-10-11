const DAY = new Intl.DateTimeFormat('en-GB', {
  day: 'numeric',
  month: 'short',
  year: 'numeric',
  timeZone: 'UTC',
});
const MOMENT = new Intl.DateTimeFormat('en-GB', {
  day: 'numeric',
  month: 'short',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
});
const COUNT = new Intl.NumberFormat('en-GB');

/** Formats an ISO calendar date (no time zone involved) such as 2026-11-05. */
export function formatDay(isoDate: string): string {
  return DAY.format(new Date(`${isoDate}T00:00:00Z`));
}

/** Formats an ISO instant in the viewer's own time zone. */
export function formatMoment(isoInstant: string): string {
  return MOMENT.format(new Date(isoInstant));
}

export function formatCount(n: number): string {
  return COUNT.format(n);
}

export function formatVolumeCm3(mm3: number): string {
  return `${(mm3 / 1000).toFixed(1)} cm³`;
}
