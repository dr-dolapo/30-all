import { addDaysISO } from "./rules";

/** Monday = 0 … Sunday = 6, for a YYYY-MM-DD date. */
export const weekdayISO = (iso: string) => (new Date(iso + "T12:00:00Z").getUTCDay() + 6) % 7;
export const mondayOf = (iso: string) => addDaysISO(iso, -weekdayISO(iso));

/**
 * Weeks in a row (Monday to Sunday) with at least one match, counting back from this week.
 * An empty current week doesn't break the streak yet; the week isn't over.
 */
export function weekStreak(days: Iterable<string>, today: string): number {
  const weeks = new Set<string>();
  for (const d of days) if (d <= today) weeks.add(mondayOf(d));
  let mon = mondayOf(today);
  if (!weeks.has(mon)) mon = addDaysISO(mon, -7);
  let n = 0;
  while (weeks.has(mon)) { n++; mon = addDaysISO(mon, -7); }
  return n;
}
