// Rules shared by the browser and the Worker, so both validate the same way.

export type FormatKey = "bo3" | "set6" | "set4" | "stb";
export type Side = "A" | "B";
export type SetScore = [number, number];

export const FORMATS: Record<FormatKey, { label: string; sub: string; sets: 1 | 3; kind: "set" | "stb"; target: 4 | 6 | 10 }> = {
  bo3: { label: "3 sets", sub: "Best of 3 · first to 6 games", sets: 3, kind: "set", target: 6 },
  set6: { label: "1 set to 6", sub: "First to 6 games", sets: 1, kind: "set", target: 6 },
  set4: { label: "1 set to 4", sub: "First to 4 games", sets: 1, kind: "set", target: 4 },
  stb: { label: "Super tie-breaker", sub: "First to 10 points", sets: 1, kind: "stb", target: 10 },
};

export const MAX_BACKDATE_DAYS = 14;
export const PENDING_DAYS = 7;
export const MIN_AGE = 18;

/** Returns "" when the set score is valid, otherwise a message. */
export function validSet(a: number, b: number, target: 4 | 6): string {
  if (!Number.isInteger(a) || !Number.isInteger(b) || a < 0 || b < 0) return "Enter whole numbers";
  if (a === b) return "A set can't end level";
  const w = Math.max(a, b), l = Math.min(a, b);
  if (target === 6) {
    if (w === 6 && l <= 4) return "";
    if (w === 7 && (l === 5 || l === 6)) return "";
    return "Valid set scores: 6-0 to 6-4, 7-5 or 7-6 (tie-break)";
  }
  if (w === 4 && l <= 2) return "";
  if (w === 5 && (l === 3 || l === 4)) return "";
  return "Valid set scores: 4-0 to 4-2, 5-3 or 5-4 (tie-break)";
}

/** Super tie-breaker: first to 10, won by 2. Past 10 the margin must be exactly 2. */
export function validSTB(a: number, b: number): string {
  if (!Number.isInteger(a) || !Number.isInteger(b) || a < 0 || b < 0) return "Enter whole numbers";
  const w = Math.max(a, b), l = Math.min(a, b);
  if (w < 10) return "The winner needs at least 10 points";
  if (w - l < 2) return "Must be won by 2 clear points";
  if (w > 10 && w - l !== 2) return "Past 10 points, the margin must be exactly 2 (e.g. 12-10)";
  return "";
}

export interface ScoreResult {
  error: string;          // "" when valid or simply incomplete
  complete: boolean;      // true when a winner is decided and every set is valid
  winner: Side | null;
  sets: SetScore[];
  thirdSetNeeded: boolean;
}

/** Evaluate raw input (strings or numbers; "" = not entered yet). Side A is the submitter's side. */
export function evalScore(format: FormatKey, raw: Array<[string | number, string | number]>): ScoreResult {
  const F = FORMATS[format];
  const out: ScoreResult = { error: "", complete: false, winner: null, sets: [], thirdSetNeeded: false };
  const num = (v: string | number | undefined) => (v === "" || v === undefined || v === null ? NaN : Number(v));

  if (F.kind === "stb") {
    const a = num(raw[0]?.[0]), b = num(raw[0]?.[1]);
    if (isNaN(a) || isNaN(b)) return out;
    const e = validSTB(a, b);
    if (e) { out.error = e; return out; }
    out.sets = [[a, b]]; out.winner = a > b ? "A" : "B"; out.complete = true;
    return out;
  }

  let wa = 0, wb = 0;
  for (let i = 0; i < F.sets; i++) {
    if (F.sets === 3 && i === 2) {
      if (wa === 2 || wb === 2) {
        // Match decided in 2 sets: a third set must not be entered.
        const a3 = num(raw[2]?.[0]), b3 = num(raw[2]?.[1]);
        if (!isNaN(a3) || !isNaN(b3)) { out.error = "The match was decided in 2 sets, so leave set 3 empty"; return out; }
        break;
      }
      out.thirdSetNeeded = true;
    }
    const a = num(raw[i]?.[0]), b = num(raw[i]?.[1]);
    if (isNaN(a) || isNaN(b)) return out;
    const e = validSet(a, b, F.target as 4 | 6);
    if (e) { out.error = (F.sets === 3 ? `Set ${i + 1}: ` : "") + e; return out; }
    out.sets.push([a, b]);
    if (a > b) wa++; else wb++;
  }
  if (F.sets === 3 && wa < 2 && wb < 2) return out;
  out.winner = wa > wb ? "A" : "B";
  out.complete = true;
  return out;
}

/** Letters part of the player ID. Single name → first 2 letters; hyphenated/compound → first letter of first part. */
export function idPrefix(first: string, last: string): string {
  const clean = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^A-Za-z\- ]/g, "").trim();
  const f = clean(first), l = clean(last);
  const pre = l ? f.charAt(0) + l.split(/[- ]+/)[0].charAt(0) : f.slice(0, 2);
  return pre.toUpperCase().padEnd(2, "X");
}

export function randomSixDigits(): string {
  const buf = new Uint32Array(1);
  crypto.getRandomValues(buf);
  return String(100000 + (buf[0] % 900000));
}

export function ageOn(dobISO: string, ref: Date): number {
  const [y, m, d] = dobISO.split("-").map(Number);
  let age = ref.getUTCFullYear() - y;
  const rm = ref.getUTCMonth() + 1, rd = ref.getUTCDate();
  if (rm < m || (rm === m && rd < d)) age--;
  return age;
}

export function isISODate(s: unknown): s is string {
  return typeof s === "string" && /^\d{4}-\d{2}-\d{2}$/.test(s) && !isNaN(Date.parse(s + "T00:00:00Z"));
}

/** Today's date (YYYY-MM-DD) in Africa/Lagos (UTC+1, no daylight saving). */
export function lagosToday(now = new Date()): string {
  return new Date(now.getTime() + 3600_000).toISOString().slice(0, 10);
}

export function addDaysISO(iso: string, n: number): string {
  const d = new Date(iso + "T12:00:00Z");
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

/** "" when allowed: within the last 14 days and not in the future. */
export function matchDateError(dateISO: string, today: string): string {
  if (!isISODate(dateISO)) return "Choose a valid date";
  if (dateISO > today) return "The match date can't be in the future";
  if (dateISO < addDaysISO(today, -MAX_BACKDATE_DAYS)) return `Matches can be entered up to ${MAX_BACKDATE_DAYS} days back`;
  return "";
}

export function scoreLine(sets: SetScore[], from: Side = "A"): string {
  return sets.map(([a, b]) => (from === "A" ? `${a}-${b}` : `${b}-${a}`)).join(", ");
}
