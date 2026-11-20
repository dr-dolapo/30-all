import { useEffect, useMemo, useState } from "react";
import { addDaysISO, lagosToday } from "../shared/rules";
import { X } from "./icons";
import { usePresence } from "./ui";

/**
 * Play tracker. Each square is a day; its shade is how many confirmed matches were played that day.
 * Weeks run Monday to Sunday across, oldest week at the top. The streak counts weeks in a row with
 * at least one match; the current week only breaks it once it's over.
 */
export interface Activity { days: Record<string, number>; since: string }

const WD = ["M", "T", "W", "T", "F", "S", "S"];
const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const level = (n: number) => (n <= 0 ? 0 : n === 1 ? 1 : n === 2 ? 2 : 3);
const weekday = (iso: string) => (new Date(iso + "T12:00:00Z").getUTCDay() + 6) % 7; // Monday = 0
const mondayOf = (iso: string) => addDaysISO(iso, -weekday(iso));
const nice = (iso: string) => new Date(iso + "T12:00:00Z").toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" });

export function streaks(a: Activity, today = lagosToday()) {
  const weekHas = (mon: string) => { for (let k = 0; k < 7; k++) if (a.days[addDaysISO(mon, k)]) return true; return false; };
  const thisMon = mondayOf(today), firstMon = mondayOf(a.since <= today ? a.since : today);
  let current = 0, mon = weekHas(thisMon) ? thisMon : addDaysISO(thisMon, -7);
  while (mon >= firstMon && weekHas(mon)) { current++; mon = addDaysISO(mon, -7); }
  let best = 0, run = 0;
  for (let m = firstMon; m <= thisMon; m = addDaysISO(m, 7)) { if (weekHas(m)) best = Math.max(best, ++run); else run = 0; }
  const matches = Object.values(a.days).reduce((x, n) => x + n, 0);
  return { current, best, matches, days: Object.keys(a.days).length };
}

function Cell({ iso, n, today, num }: { iso: string; n: number; today: string; num?: number }) {
  if (iso > today) return <i className="ac-c fut" aria-hidden="true">{num}</i>;
  return <i className="ac-c" data-l={level(n)} data-today={iso === today || undefined} data-d={iso} data-n={n}
    title={`${nice(iso)}: ${n ? `${n} match${n > 1 ? "es" : ""}` : "no matches"}`}>{num}</i>;
}

const MAX_WEEKS = 6;

/** Up to the last 6 weeks on the profile: one row per week the player has been on 30-All. Tapping it opens the full history. */
export function ActivityCard({ a, mine }: { a: Activity; mine: boolean }) {
  const [open, setOpen] = useState(false);
  const today = lagosToday();
  // a new player sees one row in their first week, two in their second, and so on up to six
  const thisMon = mondayOf(today);
  const sinceMon = mondayOf(a.since < today ? a.since : today);
  const weeks = Math.min(MAX_WEEKS, Math.round((Date.parse(thisMon) - Date.parse(sinceMon)) / (7 * 864e5)) + 1);
  const first = addDaysISO(thisMon, -7 * (weeks - 1));
  const s = useMemo(() => streaks(a, today), [a, today]);
  let recent = 0; for (let i = 0; i < weeks * 7; i++) recent += a.days[addDaysISO(first, i)] ?? 0;
  const rows = Array.from({ length: weeks }, (_, w) => Array.from({ length: 7 }, (_, k) => addDaysISO(first, w * 7 + k)));
  return (
    <>
      <div className="h2 ac-title">Activity</div>
      <button type="button" className="card ac-card" onClick={() => setOpen(true)}
        aria-label={`Activity: ${recent} matches in the last ${weeks === 1 ? "week" : `${weeks} weeks`}, ${s.current} week streak. Open full history`}>
        <div className="ac-grid small" aria-hidden="true">
          {WD.map((d, i) => <span key={i} className="ac-wd">{d}</span>)}
          {rows.flat().map((iso) => <Cell key={iso} iso={iso} n={a.days[iso] ?? 0} today={today} />)}
        </div>
        {recent === 0 ? (
          <div className="ac-nudge">{(weeks === 1 ? "No matches this week." : `No matches in the last ${weeks} weeks.`) + (mine ? " Log a score to start a streak." : "")}</div>
        ) : (
          <div className="ac-streak"><b>{s.current}</b><span>week streak</span></div>
        )}
      </button>
      {open && <ActivitySheet a={a} onClose={() => setOpen(false)} />}
    </>
  );
}

/** Full history: every month back to when the player joined, newest month first. */
function ActivitySheet({ a, onClose }: { a: Activity; onClose: () => void }) {
  const { state, close } = usePresence(onClose, 280);
  const [picked, setPicked] = useState<string | null>(null);
  const today = lagosToday();
  const s = useMemo(() => streaks(a, today), [a, today]);
  useEffect(() => {
    const esc = (e: KeyboardEvent) => e.key === "Escape" && close();
    window.addEventListener("keydown", esc); return () => window.removeEventListener("keydown", esc);
  }, []);

  const months: Array<{ y: number; m: number }> = [];
  const stop = a.since.slice(0, 7) < today.slice(0, 7) ? a.since.slice(0, 7) : today.slice(0, 7);
  for (let y = +today.slice(0, 4), m = +today.slice(5, 7) - 1; ; m--) {
    if (m < 0) { m = 11; y--; }
    months.push({ y, m });
    if (`${y}-${String(m + 1).padStart(2, "0")}` <= stop) break;
  }
  const pick = (e: React.MouseEvent) => { const t = (e.target as HTMLElement).closest<HTMLElement>("[data-d]"); if (t) setPicked(t.dataset.d!); };
  const pn = picked ? a.days[picked] ?? 0 : 0;

  return (
    <div className="sheet-bg" data-state={state} onClick={(e) => e.target === e.currentTarget && close()}>
      <div className="sheet ac-sheet" data-state={state} role="dialog" aria-modal="true" aria-label="Activity">
        <div className="sheet-head"><h3>Activity</h3><button className="xbtn" aria-label="Close" onClick={() => close()}><X size={20} weight="bold" /></button></div>
        <div className="ac-stats">
          <div><b>{s.current}</b><span>week streak</span></div>
          <div><b>{s.best}</b><span>best streak</span></div>
          <div><b>{s.days}</b><span>days played</span></div>
          <div><b>{s.matches}</b><span>matches</span></div>
        </div>
        <div className="ac-legend" aria-hidden="true">
          <span><i className="ac-c" data-l="0" />None</span><span><i className="ac-c" data-l="1" />1</span>
          <span><i className="ac-c" data-l="2" />2</span><span><i className="ac-c" data-l="3" />3+</span>
        </div>
        <div className="ac-months" onClick={pick}>
          {months.map(({ y, m }) => {
            const last = new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
            const firstIso = `${y}-${String(m + 1).padStart(2, "0")}-01`;
            let played = 0;
            const cells = Array.from({ length: last }, (_, i) => { const iso = addDaysISO(firstIso, i); played += a.days[iso] ?? 0; return iso; });
            return (
              <section key={firstIso} className="ac-month">
                <h4>{MONTHS[m]} {y}<small>{played ? `${played} match${played > 1 ? "es" : ""}` : "No matches"}</small></h4>
                <div className="ac-grid big">
                  {WD.map((d, i) => <span key={i} className="ac-wd">{d}</span>)}
                  {Array.from({ length: weekday(firstIso) }, (_, i) => <i key={"b" + i} className="ac-blank" />)}
                  {cells.map((iso, i) => <Cell key={iso} iso={iso} n={a.days[iso] ?? 0} today={today} num={i + 1} />)}
                </div>
              </section>
            );
          })}
        </div>
        <div className="ac-pick" aria-live="polite">
          {picked ? <><b>{nice(picked)}</b> · {pn ? `${pn} match${pn > 1 ? "es" : ""}` : "no matches"}</> : "Tap a day to see it"}
        </div>
      </div>
    </div>
  );
}
