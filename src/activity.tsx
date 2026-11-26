import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { celebrated, confetti } from "./confetti";
import { addDaysISO, lagosToday } from "../shared/rules";
import { mondayOf, weekStreak } from "../shared/streak";

/**
 * Tennis days: one column per week (Monday at the top), scrolling left to right, newest on the right.
 * A ball marks each day with at least one confirmed match; other days are grey dots; days still to come
 * are outlined. The filter switches between all-time, this year and this month, and the line under the
 * grid counts matches and days played in that range.
 */
export interface Activity { days: Record<string, number>; since: string }

type Range = "all" | "year" | "month";
const RANGES: Array<[Range, string]> = [["all", "All-time"], ["year", "This year"], ["month", "This month"]];
const MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const nice = (iso: string) => new Date(iso + "T12:00:00Z").toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" });
const plural = (n: number, one: string, many = one + "s") => `${n} ${n === 1 ? one : many}`;
const STREAK_MILESTONES = [4, 8, 12, 26, 52];

function bounds(r: Range, since: string, today: string) {
  const y = today.slice(0, 4), m = today.slice(0, 7);
  if (r === "all") return { from: since < today ? since : today, to: today, label: "so far" };
  if (r === "year") return { from: `${y}-01-01`, to: `${y}-12-31`, label: "this year" };
  const last = new Date(Date.UTC(+y, +today.slice(5, 7), 0)).getUTCDate();
  return { from: `${m}-01`, to: `${m}-${String(last).padStart(2, "0")}`, label: "this month" };
}

const Ball = () => (
  <svg viewBox="0 0 20 20" aria-hidden="true">
    <circle cx="10" cy="10" r="9.2" fill="var(--o)" />
    <path d="M3.2 3.8c3.4 2.6 3.4 9.8 0 12.4M16.8 3.8c-3.4 2.6-3.4 9.8 0 12.4" fill="none" stroke="#fff" strokeWidth="1.6" strokeLinecap="round" />
  </svg>
);

export function ActivityCard({ a, first, mine, uid }: { a: Activity; first: string; mine: boolean; uid?: string }) {
  const [range, setRange] = useState<Range>("year");
  const today = lagosToday();
  const card = useRef<HTMLDivElement>(null), scroller = useRef<HTMLDivElement>(null);
  const [milestone, setMilestone] = useState(0);
  const b = bounds(range, a.since, today);

  const { cols, matches, days } = useMemo(() => {
    const cols: Array<{ mon: string; days: string[]; month?: string }> = [];
    for (let mon = mondayOf(b.from); mon <= b.to; mon = addDaysISO(mon, 7)) {
      const ds = Array.from({ length: 7 }, (_, k) => addDaysISO(mon, k));
      const firstOfMonth = ds.find((d) => d.endsWith("-01") && d >= b.from && d <= b.to);
      cols.push({ mon, days: ds, month: firstOfMonth ? MON[+firstOfMonth.slice(5, 7) - 1] + (range === "all" && firstOfMonth.slice(5, 7) === "01" ? ` ${firstOfMonth.slice(2, 4)}` : "") : undefined });
    }
    // label the first column with its month too, unless a new month starts right after it
    if (cols.length && !cols.slice(0, 3).some((c) => c.month)) cols[0].month = MON[+b.from.slice(5, 7) - 1];
    let matches = 0, days = 0;
    for (const [d, n] of Object.entries(a.days)) if (d >= b.from && d <= b.to && d <= today) { matches += n; days++; }
    return { cols, matches, days };
  }, [a, range, today]); // eslint-disable-line react-hooks/exhaustive-deps

  // open on today: its week sits near the right edge with a little of what's ahead still visible
  const [faded, setFaded] = useState(false);
  const onScroll = () => { const el = scroller.current; if (el) setFaded(el.scrollLeft > 2); };
  useLayoutEffect(() => {
    const el = scroller.current; if (!el) return;
    const col = el.querySelector<HTMLElement>("[data-now]");
    el.scrollLeft = col ? col.offsetLeft + col.offsetWidth * 3.5 - el.clientWidth : el.scrollWidth;
    onScroll();
  }, [range]);

  // your own profile: a small pop at 4, 8, 12, 26 and 52 weeks in a row, once per milestone of each streak
  const streak = useMemo(() => weekStreak(Object.keys(a.days), today), [a, today]);
  useEffect(() => {
    if (!mine || !uid || !STREAK_MILESTONES.includes(streak)) return;
    const thisMon = mondayOf(today);
    const lastMon = Object.keys(a.days).some((d) => d >= thisMon && d <= today) ? thisMon : addDaysISO(thisMon, -7);
    const key = `streak:${streak}:${addDaysISO(lastMon, -7 * (streak - 1))}`;
    if (celebrated.has(uid, key) || !card.current) return;
    setMilestone(streak);
    const io = new IntersectionObserver(([e]) => {
      if (!e.isIntersecting) return;
      io.disconnect(); celebrated.mark(uid, key);
      setTimeout(() => confetti("small", card.current?.querySelector(".td-ms") ?? card.current), 250);
    }, { threshold: 0.6 });
    io.observe(card.current);
    return () => io.disconnect();
  }, [uid, streak]); // eslint-disable-line react-hooks/exhaustive-deps

  const summary = `${first} has played ${plural(matches, "match", "matches")} on ${plural(days, "day")} ${b.label}.`;
  return (
    <div className="card td-card" ref={card}>
      <h2 className="td-title">Tennis days</h2>
      <div className="seg td-seg" role="group" aria-label="Time range">
        {RANGES.map(([k, label]) => <button key={k} type="button" className={range === k ? "on" : ""} aria-pressed={range === k} onClick={() => setRange(k)}>{label}</button>)}
      </div>
      <div className={"td-scroll" + (faded ? " faded" : "")} ref={scroller} onScroll={onScroll} tabIndex={0} role="img" aria-label={summary}>
        <div className="td-cols">
          {cols.map((c) => (
            <div className="td-col" key={c.mon} data-now={c.mon === mondayOf(today) || undefined}>
              {c.days.map((d) => {
                const cls = d < b.from || d > b.to ? "out" : d > today ? "fut" : "";
                const n = cls ? 0 : a.days[d] ?? 0;
                return <i key={d} className={"td-c " + cls} data-today={d === today || undefined}
                  title={cls === "out" ? undefined : `${nice(d)}${cls === "fut" ? "" : n ? `: ${plural(n, "match", "matches")}` : ": no tennis"}`}>{n > 0 && <Ball />}</i>;
              })}
            </div>
          ))}
        </div>
        <div className="td-months" aria-hidden="true">{cols.map((c) => <span key={c.mon}>{c.month}</span>)}</div>
      </div>
      <p className="td-sum"><b>{first}</b> has played <b>{plural(matches, "match", "matches")}</b> on {plural(days, "day")} {b.label}.{mine && matches === 0 && " Log a score to add your first ball."}</p>
      {milestone > 0 && <p className="td-ms">🔥 {milestone} weeks in a row. Keep it going.</p>}
    </div>
  );
}
