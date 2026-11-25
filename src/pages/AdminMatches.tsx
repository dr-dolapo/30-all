import { useEffect, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { FORMATS } from "../../shared/rules";
import { api, type Match } from "../api";
import { MagnifyingGlass } from "../icons";
import { HoldButton } from "../hold";
import { ErrorText, fullName, Loading, ScoreCard, TopBar, useSession, useUi } from "../ui";

type Status = "all" | Match["status"];
interface Totals { all: number; confirmed: number; pending: number; rejected: number; expired: number }
interface Page { items: Match[]; totals: Totals; next: number | null }
interface Filters { q: string; status: Status; from: string; to: string; court: string; type: "" | "singles" | "doubles" }

const STATUS_TABS: Array<[Status, string]> = [["all", "All"], ["confirmed", "Confirmed"], ["pending", "Pending"], ["rejected", "Rejected"], ["expired", "Expired"]];
const STATUS_LABEL: Record<Match["status"], string> = { confirmed: "Confirmed", pending: "Pending", rejected: "Rejected", expired: "Expired" };
const STATUS_TONE: Record<Match["status"], string> = { confirmed: "ok", pending: "pend", rejected: "bad", expired: "bad" };
const EMPTY: Filters = { q: "", status: "all", from: "", to: "", court: "", type: "" };

const dateText = (iso: string) => new Date(iso + "T12:00:00").toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
const team = (ps: Match["teamA"]) => ps.map(fullName).join(" & ");
const scoreText = (m: Match) => m.sets.map(([a, b]) => (m.winner === "A" ? `${a}-${b}` : `${b}-${a}`)).join(", ");

function useWide() {
  const q = "(min-width: 760px)";
  const [wide, setWide] = useState(() => window.matchMedia(q).matches);
  useEffect(() => {
    const mq = window.matchMedia(q); const on = () => setWide(mq.matches);
    mq.addEventListener("change", on); return () => mq.removeEventListener("change", on);
  }, []);
  return wide;
}

/** Admin › Matches: every match, filterable, view only. Cards on phones, a table on wider screens. */
export function AdminMatches({ courts }: { courts: Array<{ id: string; name: string }> }) {
  const nav = useNavigate(); const wide = useWide();
  const [f, setF] = useState<Filters>(EMPTY);
  const [q, setQ] = useState(""); // search box, applied after a short pause
  const [page, setPage] = useState<Page | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const [err, setErr] = useState("");
  const req = useRef(0);
  const more = useRef<HTMLDivElement>(null);

  useEffect(() => { const t = setTimeout(() => setF((x) => ({ ...x, q: q.trim() })), 250); return () => clearTimeout(t); }, [q]);

  const query = (offset: number) => {
    const p = new URLSearchParams({ offset: String(offset), limit: "30" });
    if (f.q) p.set("q", f.q);
    if (f.status !== "all") p.set("status", f.status);
    if (f.from) p.set("from", f.from);
    if (f.to) p.set("to", f.to);
    if (f.court) p.set("court", f.court);
    if (f.type) p.set("type", f.type);
    return api.get<Page>("/admin/matches?" + p.toString());
  };

  useEffect(() => {
    const n = ++req.current; setErr("");
    query(0).then((r) => n === req.current && setPage(r)).catch((e) => n === req.current && setErr(e.message));
  }, [f]);

  const loadMore = () => {
    if (!page || page.next === null || loadingMore) return;
    const n = req.current; setLoadingMore(true);
    query(page.next).then((r) => { if (n === req.current) setPage((p) => p && { ...r, items: [...p.items, ...r.items] }); })
      .catch((e) => setErr(e.message)).finally(() => setLoadingMore(false));
  };

  // load the next page when the end of the list scrolls into view
  useEffect(() => {
    const el = more.current; if (!el) return;
    const io = new IntersectionObserver((es) => es[0].isIntersecting && loadMore(), { rootMargin: "300px" });
    io.observe(el); return () => io.disconnect();
  });

  const set = (patch: Partial<Filters>) => setF((x) => ({ ...x, ...patch }));
  const filtered = f.q || f.from || f.to || f.court || f.type;
  const open = (m: Match) => nav(`/admin/matches/${m.id}`);

  return (
    <>
      <div className="am-search">
        <MagnifyingGlass size={18} aria-hidden="true" />
        <input className="inp" type="search" placeholder="Search by player name or ID" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search by player name or ID" />
      </div>
      <div className="am-filters">
        <label><span>From</span><input className="inp" type="date" value={f.from} max={f.to || undefined} onChange={(e) => set({ from: e.target.value })} /></label>
        <label><span>To</span><input className="inp" type="date" value={f.to} min={f.from || undefined} onChange={(e) => set({ to: e.target.value })} /></label>
        <label><span>Court</span>
          <select className="inp" value={f.court} onChange={(e) => set({ court: e.target.value })}>
            <option value="">All courts</option>
            {courts.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </label>
        <label><span>Type</span>
          <select className="inp" value={f.type} onChange={(e) => set({ type: e.target.value as Filters["type"] })}>
            <option value="">Singles &amp; doubles</option><option value="singles">Singles</option><option value="doubles">Doubles</option>
          </select>
        </label>
      </div>
      {filtered && <button className="link am-clear" onClick={() => { setQ(""); setF({ ...EMPTY, status: f.status }); }}>Clear filters</button>}

      {/* totals for the current filters; each one also filters the list by that status */}
      <div className="am-totals" role="tablist" aria-label="Filter by status">
        {STATUS_TABS.map(([s, label]) => (
          <button key={s} role="tab" aria-selected={f.status === s} className={"am-total" + (f.status === s ? " on" : "")} onClick={() => set({ status: s })}>
            <b>{page ? page.totals[s] : "–"}</b><span>{label}</span>
          </button>
        ))}
      </div>

      <ErrorText msg={err} />
      {!page ? <Loading /> : page.items.length === 0 ? (
        <div className="empty">{filtered || f.status !== "all" ? "No matches fit these filters." : "No matches yet."}</div>
      ) : wide ? (
        <div className="card am-tablewrap">
          <table className="am-table">
            <thead><tr><th>Date</th><th>Winner</th><th>Score</th><th>Loser</th><th>Court</th><th>Type</th><th>Status</th></tr></thead>
            <tbody>
              {page.items.map((m) => {
                const W = m.winner === "A" ? m.teamA : m.teamB, L = m.winner === "A" ? m.teamB : m.teamA;
                return (
                  <tr key={m.id} tabIndex={0} onClick={() => open(m)} onKeyDown={(e) => e.key === "Enter" && open(m)}>
                    <td className="nowrap">{dateText(m.date)}</td>
                    <td className="am-win">{team(W)}</td>
                    <td className="nowrap am-score">{scoreText(m)}</td>
                    <td className="am-lose">{team(L)}</td>
                    <td>{m.court?.name ?? "—"}</td>
                    <td>{m.type === "singles" ? "Singles" : "Doubles"}</td>
                    <td><span className={"pill " + STATUS_TONE[m.status]}>{STATUS_LABEL[m.status]}</span></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="am-cards">
          {page.items.map((m) => (
            <div key={m.id} className="am-card" onClick={(e) => !(e.target as HTMLElement).closest("a, button") && open(m)}>
              <ScoreCard m={m} showDate showConfirmed />
              <button type="button" className="am-open" onClick={() => open(m)}>Match details<span className="sr-only">, {dateText(m.date)}</span></button>
            </div>
          ))}
        </div>
      )}
      {page && page.next !== null && (
        <div ref={more} style={{ textAlign: "center", margin: "14px 0" }}>
          <button className="btn ghost sm" onClick={loadMore} disabled={loadingMore}>{loadingMore ? "Loading…" : "Show more"}</button>
        </div>
      )}
    </>
  );
}

interface Person { id: string; first: string; last: string; pid: string; status: string }
type MatchDetail = Match & { submitter: Person | null; resolver: Person | null };

/** Admin › Matches › one match, view only. */
export function AdminMatchPage() {
  const { id } = useParams(); const nav = useNavigate(); const { me } = useSession(); const { toast, confirm } = useUi();
  const [m, setM] = useState<MatchDetail | null>(null); const [err, setErr] = useState("");
  const [reason, setReason] = useState(""); const [delErr, setDelErr] = useState("");
  useEffect(() => { api.get<MatchDetail>(`/admin/matches/${id}`).then(setM).catch((e) => setErr(e.message)); }, [id]);
  const back = () => nav("/admin?tab=matches");
  async function del() {
    setDelErr("");
    try { await api.post(`/admin/matches/${id}/delete`, { reason }); toast("Match deleted. The players were told."); back(); }
    catch (e: any) { setDelErr(e.message); }
  }

  if (!me?.isAdmin) return <><TopBar title="Admin" back="/me" /><main><div className="empty">Admins only.</div></main></>;
  if (err) return <><TopBar title="Match" back={back} dark /><main><ErrorText msg={err} /></main></>;
  if (!m) return <Loading />;

  const when = (t: number) => new Date(t).toLocaleString("en-GB", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
  const person = (p: Person | null) => p ? <Link to={`/admin/users/${p.id}`}>{fullName(p)}</Link> : "—";
  const settled = m.status === "confirmed" ? "Accepted" : m.status === "rejected" ? "Rejected" : null;
  const winners = m.winner === "A" ? m.teamA : m.teamB;

  return (
    <>
      <TopBar title="Match" back={back} dark />
      <main className="narrow">
        <ScoreCard m={m} showDate showConfirmed />
        <div className="h2">Details</div>
        <div className="card"><dl className="kv">
          <dt>Status</dt><dd><span className={"pill " + STATUS_TONE[m.status]}>{STATUS_LABEL[m.status]}</span></dd>
          <dt>Date played</dt><dd>{dateText(m.date)}</dd>
          <dt>Court</dt><dd>{m.court?.name ?? "—"}</dd>
          <dt>Type</dt><dd>{m.type === "singles" ? "Singles" : "Doubles"}</dd>
          <dt>Format</dt><dd>{FORMATS[m.format]?.label ?? m.format}</dd>
          <dt>Score</dt><dd>{scoreText(m)} to {team(winners)}</dd>
        </dl></div>
        <div className="h2">Players</div>
        <div className="card"><dl className="kv">
          <dt>{m.type === "singles" ? "Submitter's side" : "Team 1"}</dt><dd>{m.teamA.map((p, i) => <span key={p.id}>{i ? " & " : ""}<Link to={`/admin/users/${p.id}`}>{fullName(p)}</Link></span>)}</dd>
          <dt>{m.type === "singles" ? "Opponent" : "Team 2"}</dt><dd>{m.teamB.map((p, i) => <span key={p.id}>{i ? " & " : ""}<Link to={`/admin/users/${p.id}`}>{fullName(p)}</Link></span>)}</dd>
        </dl></div>
        <div className="h2">History</div>
        <div className="card"><dl className="kv">
          <dt>Submitted by</dt><dd>{person(m.submitter)}</dd>
          <dt>Submitted</dt><dd>{when(m.submittedAt)}</dd>
          {settled && <><dt>{settled} by</dt><dd>{person(m.resolver)}</dd></>}
          {m.resolvedAt && <><dt>{settled ?? "Expired"}</dt><dd>{when(m.resolvedAt)}</dd></>}
          {m.status === "pending" && <><dt>Expires</dt><dd>{when(m.expiresAt ?? m.submittedAt + 7 * 864e5)}</dd></>}
          <dt>Match ID</dt><dd className="mono">{m.id}</dd>
        </dl></div>
        <div className="h2">Delete match</div>
        <div className="card">
          <p className="small" style={{ marginTop: 0 }}>
            {m.status === "confirmed" ? "This removes the match from both sides' records, the leaderboard and streaks. " : "This removes the match for everyone. "}
            All {m.teamA.length + m.teamB.length} players get an inbox message and email. This can't be undone.
          </p>
          <label className="f" htmlFor="f-del-reason">Reason <span className="opt">(optional, included in the message)</span></label>
          <textarea id="f-del-reason" className="inp" rows={2} maxLength={300} placeholder="e.g. Entered twice by mistake" value={reason} onChange={(e) => setReason(e.target.value)} />
          <ErrorText msg={delErr} />
          <div style={{ marginTop: 10 }}>
            <HoldButton label="Hold to delete match" ms={1500} onConfirm={del}
              onKeyboard={() => confirm({ title: "Delete this match?", body: `${scoreText(m)} on ${dateText(m.date)}. All players will be told. This can't be undone.`, ok: "Delete", danger: true, onOk: del })} />
          </div>
        </div>
      </main>
    </>
  );
}
