/** The user's local calendar date as YYYY-MM-DD (streaks, daily limits). Falls back to UTC. */
export function localDay(date: Date, timeZone: string): string {
  try {
    return new Intl.DateTimeFormat('en-CA', {
      timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(date);
  } catch {
    return date.toISOString().slice(0, 10);
  }
}

export const DAY_MS = 86_400_000;

/** The Monday (YYYY-MM-DD) of the user's local week containing `date`. */
export function localWeekStart(date: Date, timeZone: string): string {
  const day = localDay(date, timeZone);
  const d = new Date(`${day}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7));
  return d.toISOString().slice(0, 10);
}
