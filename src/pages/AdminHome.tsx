import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { api, type Match } from "../api";
import { ArrowDownRight, ArrowUpRight, Warning } from "../icons";
import { ErrorText, fullName, Loading } from "../ui";

interface Stats {
  today: string;
  players: number; activeCourts: number;
  gender: Record<string, number>;
  growth: Array<{ date: string; added: number; total: number }>;
  weeklyActive: { now: number; before: number };
  matchesDaily: Array<{ date: string; singles: number; doubles: number }>;
  funnel: { signedUp: number; verified: number; onboarded: number; played: number };
  topCourts: Array<{ id: string; name: string; n: number }>;
  topPlayers: Array<{ id: string; first: string; last: string; n: number }>;
  attention: { courts: Array<{ id: string; name: string }>; courtsWaiting: number; expiring: Array<Match & { expiresAt: number }> };
}

const dayLabel = (iso: string) => new Date(iso + "T12:00:00").toLocaleDateString("en-GB", { day: "numeric", month: "short" });
const weekday = (iso: string) => new Date(iso + "T12:00:00").toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" });
const pct = (n: number, of: number) => (of ? Math.round((n / of) * 100) : 0);

/** Admin › Home: how 30-All is doing today. */
export function AdminHome({ onTab }: { onTab: (t: "courts") => void }) {
  const [s, setS] = useState<Stats | null>(null); const [err, setErr] = useState("");
  useEffect(() => { api.get<Stats>("/admin/stats").then(setS).catch((e) => setErr(e.message)); }, []);
  if (err) return <ErrorText msg={err} />;
  if (!s) return <Loading />;

  const added14 = s.growth.reduce((a, d) => a + d.added, 0);
  const matches14 = s.matchesDaily.reduce((a, d) => a + d.singles + d.doubles, 0);
  const wDelta = s.weeklyActive.now - s.weeklyActive.before;
  const g = { Male: s.gender.Male ?? 0, Female: s.gender.Female ?? 0, "Not set": s.gender["Not set"] ?? 0 };
  const attention = s.attention.courtsWaiting + s.attention.expiring.length;

  return (
    <div className="dash">
      <div className="dash-kpis">
        <Kpi label="Players" value={s.players} sub={`+${added14} in the last 14 days`} />
        <Kpi label="Active courts" value={s.activeCourts} sub="Courts players call home or play at" />
        <Kpi label="Weekly active players" value={s.weeklyActive.now}
          sub={<span className={"dash-delta " + (wDelta > 0 ? "up" : wDelta < 0 ? "down" : "")}>
            {wDelta > 0 ? <ArrowUpRight size={14} weight="bold" /> : wDelta < 0 ? <ArrowDownRight size={14} weight="bold" /> : null}
            {wDelta === 0 ? "Same as" : `${Math.abs(wDelta)} ${wDelta > 0 ? "more" : "fewer"} than`} the week before</span>} />
      </div>

      {attention > 0 && (
        <section className="dash-card dash-attn">
          <h3><Warning size={18} weight="fill" /> Needs attention</h3>
          {s.attention.courtsWaiting > 0 && (
            <div className="dash-attn-row">
              <div><b>{s.attention.courtsWaiting} court{s.attention.courtsWaiting === 1 ? "" : "s"} waiting for review</b>
                <div className="small">{s.attention.courts.map((c) => c.name).join(", ")}{s.attention.courtsWaiting > s.attention.courts.length ? "…" : ""}</div></div>
              <button className="btn sm ghost" onClick={() => onTab("courts")}>Review</button>
            </div>
          )}
          {s.attention.expiring.map((m) => (
            <div className="dash-attn-row" key={m.id}>
              <div><b>Score expires {new Date(m.expiresAt).toLocaleString("en-GB", { weekday: "short", hour: "2-digit", minute: "2-digit" })}</b>
                <div className="small">{m.teamA.map(fullName).join(" & ")} vs {m.teamB.map(fullName).join(" & ")} · played {dayLabel(m.date)}</div></div>
              <Link className="btn sm ghost" to={`/admin/matches/${m.id}`}>View</Link>
            </div>
          ))}
        </section>
      )}

      <div className="dash-grid">
        <section className="dash-card">
          <h3>Player growth</h3>
          <p className="dash-sub">Last 14 days · {s.players} players, +{added14} new</p>
          <GrowthChart data={s.growth} />
        </section>

        <section className="dash-card">
          <h3>Matches logged</h3>
          <p className="dash-sub">Last 14 days · {matches14} scores submitted</p>
          <MatchesChart data={s.matchesDaily} />
        </section>

        <section className="dash-card">
          <h3>Gender split</h3>
          <p className="dash-sub">{s.players} players</p>
          <Split parts={[["Male", g.Male, "var(--viz-1)"], ["Female", g.Female, "var(--viz-2)"], ["Not set", g["Not set"], "var(--viz-none)"]]} />
        </section>

        <section className="dash-card">
          <h3>Sign-up funnel</h3>
          <p className="dash-sub">Everyone who has started signing up</p>
          <Funnel steps={[
            ["Signed up", s.funnel.signedUp], ["Verified email", s.funnel.verified],
            ["Finished profile", s.funnel.onboarded], ["Played a confirmed match", s.funnel.played],
          ]} />
        </section>

        <section className="dash-card">
          <h3>Top courts</h3>
          <p className="dash-sub">Confirmed matches, last 30 days</p>
          <Ranked rows={s.topCourts.map((c) => ({ id: c.id, label: c.name, n: c.n }))} empty="No confirmed matches in the last 30 days." />
        </section>

        <section className="dash-card">
          <h3>Most active players</h3>
          <p className="dash-sub">Confirmed matches, last 30 days</p>
          <Ranked rows={s.topPlayers.map((p) => ({ id: p.id, label: fullName(p), n: p.n, to: `/admin/users/${p.id}` }))} empty="No confirmed matches in the last 30 days." />
        </section>
      </div>
    </div>
  );
}

function Kpi({ label, value, sub }: { label: string; value: number; sub: ReactNode }) {
  return (
    <div className="dash-card dash-kpi">
      <div className="dash-kpi-label">{label}</div>
      <div className="dash-kpi-value">{value.toLocaleString("en-GB")}</div>
      <div className="dash-kpi-sub">{sub}</div>
    </div>
  );
}

/* ---------- charts (plain SVG) ---------- */

function useWidth() {
  const ref = useRef<HTMLDivElement>(null);
  const [w, setW] = useState(320);
  useLayoutEffect(() => {
    const el = ref.current; if (!el) return;
    const ro = new ResizeObserver(() => setW(el.clientWidth)); ro.observe(el); setW(el.clientWidth);
    return () => ro.disconnect();
  }, []);
  return [ref, w] as const;
}

const niceMax = (v: number) => {
  if (v <= 4) return 4;
  const step = Math.pow(10, Math.floor(Math.log10(v)));
  for (const m of [1, 2, 2.5, 5, 10]) if (m * step >= v) return m * step;
  return 10 * step;
};
/** A bar whose top corners are rounded (4px) and whose base sits flat on the baseline. */
const barPath = (x: number, y: number, w: number, h: number, r = 4) => {
  if (h <= 0) return "";
  const rr = Math.min(r, w / 2, h);
  return `M${x},${y + h}V${y + rr}Q${x},${y} ${x + rr},${y}H${x + w - rr}Q${x + w},${y} ${x + w},${y + rr}V${y + h}Z`;
};
const PAD = { l: 30, r: 8 };

function XAxis({ dates, x, y }: { dates: string[]; x: (i: number) => number; y: number }) {
  const show = new Set([0, Math.round((dates.length - 1) / 2), dates.length - 1]);
  return <>{dates.map((d, i) => show.has(i) && <text key={d} x={x(i)} y={y} textAnchor={i === 0 ? "start" : i === dates.length - 1 ? "end" : "middle"} className="viz-tick">{dayLabel(d)}</text>)}</>;
}
function Grid({ max, h, top, w, ticks = 2 }: { max: number; h: number; top: number; w: number; ticks?: number }) {
  return <>{Array.from({ length: ticks + 1 }, (_, i) => {
    const v = (max / ticks) * i, y = top + h - (v / max) * h;
    return <g key={i}><line x1={PAD.l} x2={w - PAD.r} y1={y} y2={y} className={i ? "viz-grid" : "viz-base"} /><text x={PAD.l - 6} y={y + 4} textAnchor="end" className="viz-tick">{Number.isInteger(v) ? v : v.toFixed(1)}</text></g>;
  })}</>;
}
function Tip({ x, w, children }: { x: number; w: number; children: ReactNode }) {
  const left = Math.max(70, Math.min(w - 70, x));
  return <div className="viz-tip" style={{ left }}>{children}</div>;
}

/** Total players (line) above new players per day (bars): two small charts on one shared day axis. */
function GrowthChart({ data }: { data: Stats["growth"] }) {
  const [ref, w] = useWidth();
  const [hover, setHover] = useState<number | null>(null);
  const n = data.length, step = (w - PAD.l - PAD.r) / n;
  const x = (i: number) => PAD.l + step * i + step / 2;
  const lineH = 92, barTop = 128, barH = 56;
  const minT = Math.min(...data.map((d) => d.total)), maxT = Math.max(...data.map((d) => d.total));
  const lo = Math.max(0, Math.floor(minT - Math.max(1, (maxT - minT) * 0.2))), hi = niceMax(Math.max(maxT, lo + 4));
  const ly = (v: number) => 10 + lineH - ((v - lo) / (hi - lo)) * lineH;
  const maxA = niceMax(Math.max(1, ...data.map((d) => d.added)));
  const bw = Math.max(4, Math.min(18, step - 2));
  const pts = data.map((d, i) => `${x(i)},${ly(d.total)}`).join(" ");
  const H = barTop + barH + 22;
  return (
    <div ref={ref} className="viz" onPointerLeave={() => setHover(null)}>
      <svg width={w} height={H} role="img" aria-label={`Players grew from ${data[0]?.total} to ${data[n - 1]?.total} over 14 days`}>
        <text x={PAD.l} y={6} className="viz-axis-title">Total players</text>
        {[lo, hi].map((v, i) => <g key={i}><line x1={PAD.l} x2={w - PAD.r} y1={ly(v)} y2={ly(v)} className={i ? "viz-grid" : "viz-base"} /><text x={PAD.l - 6} y={ly(v) + 4} textAnchor="end" className="viz-tick">{v}</text></g>)}
        <polyline points={pts} fill="none" stroke="var(--viz-1)" strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
        <circle cx={x(n - 1)} cy={ly(data[n - 1].total)} r={4} fill="var(--viz-1)" stroke="#fff" strokeWidth={2} />
        <text x={barTop ? PAD.l : 0} y={barTop - 8} className="viz-axis-title">New players per day</text>
        <Grid max={maxA} h={barH} top={barTop} w={w} ticks={2} />
        {data.map((d, i) => <path key={d.date} d={barPath(x(i) - bw / 2, barTop + barH - (d.added / maxA) * barH, bw, (d.added / maxA) * barH)} fill="var(--viz-1)" opacity={hover === null || hover === i ? 1 : 0.45} />)}
        {hover !== null && <>
          <line x1={x(hover)} x2={x(hover)} y1={10} y2={barTop + barH} className="viz-cross" />
          <circle cx={x(hover)} cy={ly(data[hover].total)} r={5} fill="var(--viz-1)" stroke="#fff" strokeWidth={2} />
        </>}
        <XAxis dates={data.map((d) => d.date)} x={x} y={H - 4} />
        {data.map((d, i) => <rect key={d.date} x={PAD.l + step * i} y={0} width={step} height={H - 18} fill="transparent" onPointerEnter={() => setHover(i)} onPointerDown={() => setHover(i)} />)}
      </svg>
      {hover !== null && <Tip x={x(hover)} w={w}><b>{weekday(data[hover].date)}</b><span>{data[hover].total} players</span><span>+{data[hover].added} new</span></Tip>}
      <DataTable head={["Day", "Total players", "New"]} rows={data.map((d) => [dayLabel(d.date), d.total, d.added])} />
    </div>
  );
}

/** Matches submitted per day, singles and doubles stacked. */
function MatchesChart({ data }: { data: Stats["matchesDaily"] }) {
  const [ref, w] = useWidth();
  const [hover, setHover] = useState<number | null>(null);
  const n = data.length, step = (w - PAD.l - PAD.r) / n;
  const x = (i: number) => PAD.l + step * i + step / 2;
  const top = 8, h = 150, H = top + h + 22;
  const max = niceMax(Math.max(1, ...data.map((d) => d.singles + d.doubles)));
  const bw = Math.max(4, Math.min(18, step - 2));
  const sy = (v: number) => (v / max) * h;
  const tot = { s: data.reduce((a, d) => a + d.singles, 0), d: data.reduce((a, d) => a + d.doubles, 0) };
  return (
    <div ref={ref} className="viz" onPointerLeave={() => setHover(null)}>
      <Legend items={[["Singles", "var(--viz-1)", tot.s], ["Doubles", "var(--viz-2)", tot.d]]} />
      <svg width={w} height={H} role="img" aria-label={`${tot.s} singles and ${tot.d} doubles scores submitted in 14 days`}>
        <Grid max={max} h={h} top={top} w={w} ticks={2} />
        {data.map((d, i) => {
          const s = sy(d.singles), dd = sy(d.doubles), base = top + h, gap = s && dd ? 2 : 0;
          const dim = hover !== null && hover !== i ? 0.45 : 1;
          return <g key={d.date} opacity={dim}>
            {/* singles sits on the baseline; doubles stacks on top with a 2px gap; only the top segment is rounded */}
            {s > 0 && <path d={dd ? `M${x(i) - bw / 2},${base}V${base - s}H${x(i) + bw / 2}V${base}Z` : barPath(x(i) - bw / 2, base - s, bw, s)} fill="var(--viz-1)" />}
            {dd > 0 && <path d={barPath(x(i) - bw / 2, base - s - gap - dd, bw, dd)} fill="var(--viz-2)" />}
          </g>;
        })}
        <XAxis dates={data.map((d) => d.date)} x={x} y={H - 4} />
        {data.map((d, i) => <rect key={d.date} x={PAD.l + step * i} y={0} width={step} height={H - 18} fill="transparent" onPointerEnter={() => setHover(i)} onPointerDown={() => setHover(i)} />)}
      </svg>
      {hover !== null && <Tip x={x(hover)} w={w}><b>{weekday(data[hover].date)}</b><span><i className="viz-key" style={{ background: "var(--viz-1)" }} />{data[hover].singles} singles</span><span><i className="viz-key" style={{ background: "var(--viz-2)" }} />{data[hover].doubles} doubles</span></Tip>}
      <DataTable head={["Day", "Singles", "Doubles"]} rows={data.map((d) => [dayLabel(d.date), d.singles, d.doubles])} />
    </div>
  );
}

function Legend({ items }: { items: Array<[string, string, number?]> }) {
  return <div className="viz-legend">{items.map(([l, c, v]) => <span key={l}><i className="viz-key" style={{ background: c }} />{l}{v !== undefined && <b>{v}</b>}</span>)}</div>;
}

/** One bar split into parts, each labelled with its count and share. */
function Split({ parts }: { parts: Array<[string, number, string]> }) {
  const total = parts.reduce((a, p) => a + p[1], 0);
  const shown = parts.filter((p) => p[1] > 0);
  return (
    <div className="viz">
      <div className="split-bar" role="img" aria-label={shown.map(([l, n]) => `${l} ${n} (${pct(n, total)}%)`).join(", ")}>
        {shown.map(([l, n, c]) => <span key={l} title={`${l}: ${n} (${pct(n, total)}%)`} style={{ flexGrow: n, background: c }} />)}
      </div>
      <div className="split-legend">
        {parts.map(([l, n, c]) => (
          <div key={l}><i className="viz-key" style={{ background: c }} /><span>{l}</span><b>{n}</b><em>{pct(n, total)}%</em></div>
        ))}
      </div>
    </div>
  );
}

/** Each step as a share of everyone who signed up. */
function Funnel({ steps }: { steps: Array<[string, number]> }) {
  const first = steps[0][1] || 1;
  return (
    <div className="funnel">
      {steps.map(([l, n], i) => (
        <div key={l} className="funnel-row" title={i ? `${pct(n, steps[i - 1][1])}% of the step before` : undefined}>
          <div className="funnel-top"><span>{l}</span><b>{n}</b><em>{pct(n, first)}%</em></div>
          <div className="funnel-track"><span style={{ width: `${(n / first) * 100}%` }} /></div>
        </div>
      ))}
    </div>
  );
}

function Ranked({ rows, empty }: { rows: Array<{ id: string; label: string; n: number; to?: string }>; empty: string }) {
  if (!rows.length) return <div className="dash-empty">{empty}</div>;
  const max = Math.max(...rows.map((r) => r.n));
  return (
    <ol className="ranked">
      {rows.map((r, i) => (
        <li key={r.id}>
          <span className="ranked-i">{i + 1}</span>
          <div className="ranked-main">
            <div className="ranked-top">{r.to ? <Link to={r.to}>{r.label}</Link> : <span>{r.label}</span>}<b>{r.n}</b></div>
            <div className="funnel-track"><span style={{ width: `${(r.n / max) * 100}%` }} /></div>
          </div>
        </li>
      ))}
    </ol>
  );
}

/** The numbers behind a chart, for screen readers. */
function DataTable({ head, rows }: { head: string[]; rows: Array<Array<string | number>> }) {
  return (
    <table className="sr-only">
      <thead><tr>{head.map((h) => <th key={h}>{h}</th>)}</tr></thead>
      <tbody>{rows.map((r, i) => <tr key={i}>{r.map((c, j) => <td key={j}>{c}</td>)}</tr>)}</tbody>
    </table>
  );
}
