import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { addDaysISO, evalScore, FORMATS, lagosToday, scoreLine, type FormatKey } from "../../shared/rules";
import { api, type CourtRef, type Match, type PublicUser } from "../api";
import { Avatar, BottomNav, Calendar, ErrorText, fullName, Loading, MatchCard, TopBar, useSession, useUi } from "../ui";

export function usePendingCount() {
  const [n, setN] = useState(0);
  const { me } = useSession();
  useEffect(() => {
    if (!me) return;
    api.get<Match[]>("/matches/pending").then((ms) => setN(ms.filter((m) => m.teamB.some((p) => p.id === me.id)).length)).catch(() => {});
  }, [me]);
  return n;
}

export function Matches() {
  const { me, refresh } = useSession(); const { toast, confirm } = useUi(); const nav = useNavigate();
  const [pending, setPending] = useState<Match[] | null>(null);
  const [list, setList] = useState<Match[] | null>(null);
  const today = new Date();
  const [month, setMonth] = useState({ y: today.getFullYear(), m: today.getMonth() });
  const [sel, setSel] = useState<string | null>(null);
  const [filter, setFilter] = useState({ mine: false, player: "", court: "" });
  const [players, setPlayers] = useState<PublicUser[]>([]);
  const [courts, setCourts] = useState<CourtRef[]>([]);

  const loadPending = useCallback(() => api.get<Match[]>("/matches/pending").then(setPending).catch(() => setPending([])), []);
  useEffect(() => { loadPending(); api.get<PublicUser[]>("/players").then(setPlayers).catch(() => {}); api.get<CourtRef[]>("/ref/courts").then(setCourts).catch(() => {}); }, [loadPending]);
  useEffect(() => {
    setList(null);
    const q = new URLSearchParams({ month: `${month.y}-${String(month.m + 1).padStart(2, "0")}` });
    if (filter.mine) q.set("mine", "1"); if (filter.player) q.set("player", filter.player); if (filter.court) q.set("court", filter.court);
    api.get<Match[]>(`/matches?${q}`).then(setList).catch(() => setList([]));
  }, [month, filter]);

  const days = useMemo(() => new Set((list ?? []).map((m) => m.date)), [list]);
  if (!me) return <Loading />;
  const toAnswer = (pending ?? []).filter((m) => m.teamB.some((p) => p.id === me.id));
  const waiting = (pending ?? []).filter((m) => m.teamA.some((p) => p.id === me.id));
  const shown = (list ?? []).filter((m) => !sel || m.date === sel);

  const act = async (m: Match, action: "accept" | "reject" | "delete") => {
    try {
      if (action === "delete") await api.del(`/matches/${m.id}`); else await api.post(`/matches/${m.id}/${action}`);
      toast(action === "accept" ? "Score accepted. Everyone in the match has been notified." : action === "reject" ? "Score rejected. Everyone in the match has been notified." : "Pending score deleted.");
      loadPending(); refresh(); setMonth({ ...month });
    } catch (e: any) { toast(e.message); }
  };
  const actions = (m: Match) => {
    if (m.teamB.some((p) => p.id === me.id)) return (
      <div className="acts">
        <button className="btn sm bad" onClick={() => confirm({ title: "Reject this score?", body: "It won't be recorded. Everyone in the match will be told, and it can be entered again.", ok: "Reject", danger: true, onOk: () => act(m, "reject") })}>Reject</button>
        <button className="btn sm ok" onClick={() => act(m, "accept")}>Accept score</button>
      </div>
    );
    if (m.submittedBy === me.id) return (
      <div className="acts"><button className="btn sm ghost" onClick={() => confirm({ title: "Delete this pending score?", body: "Your opponents won't see it any more. You can enter the correct score again.", ok: "Delete", danger: true, onOk: () => act(m, "delete") })}>Delete & re-enter</button></div>
    );
    const sub = m.teamA.find((p) => p.id === m.submittedBy);
    return <p className="small" style={{ marginTop: 8 }}>Your partner {sub?.first} entered this. Waiting for an opponent to accept.</p>;
  };

  return (
    <>
      <TopBar title="Matches" />
      <main className="wide">
       <div className="cols">
       <section>
        <button className="btn" style={{ marginBottom: 14 }} onClick={() => nav("/matches/new")}>+ Enter a score</button>
        {toAnswer.length > 0 && <><div className="h2">Needs your answer ({toAnswer.length})</div>{toAnswer.map((m) => <MatchCard key={m.id} m={m} actions={actions(m)} />)}</>}
        {waiting.length > 0 && <><div className="h2">Waiting on opponents</div>{waiting.map((m) => <MatchCard key={m.id} m={m} actions={actions(m)} />)}</>}
        {toAnswer.length + waiting.length === 0 && pending !== null && <div className="hide-mobile"><div className="h2">Pending</div><div className="empty card">No scores waiting for an answer.</div></div>}
       </section>
       <section className="sticky-col">
        <div className="h2">Results</div>
        <div className="chips" style={{ marginBottom: 8 }}>
          <button className={"chip" + (!filter.mine ? " on" : "")} onClick={() => setFilter({ ...filter, mine: false })}>Everyone</button>
          <button className={"chip" + (filter.mine ? " on" : "")} onClick={() => setFilter({ ...filter, mine: true })}>My matches</button>
        </div>
        <div className="row" style={{ marginBottom: 10 }}>
          <select className="inp" aria-label="Filter by player" value={filter.player} onChange={(e) => setFilter({ ...filter, player: e.target.value })}>
            <option value="">Any player</option>{players.map((p) => <option key={p.id} value={p.id}>{fullName(p)}</option>)}
          </select>
          <select className="inp" aria-label="Filter by court" value={filter.court} onChange={(e) => setFilter({ ...filter, court: e.target.value })}>
            <option value="">Any court</option>{courts.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </div>
        <Calendar month={month} onMonth={(m) => { setMonth(m); setSel(null); }} days={days} selected={sel} onSelect={setSel} />
       </section>
       <section className="list-col">
        <div className="h2" style={{ display: "flex", justifyContent: "space-between" }}>
          <span>{sel ? new Date(sel + "T12:00:00").toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" }) : "This month"}</span>
          {sel && <button className="link" style={{ textTransform: "none" }} onClick={() => setSel(null)}>Show whole month</button>}
        </div>
        {list === null ? <Loading /> : shown.length ? <div className="cardgrid">{shown.map((m) => <MatchCard key={m.id} m={m} />)}</div> : <div className="empty">No confirmed matches here yet.</div>}
       </section>
       </div>
      </main>
      <BottomNav pending={toAnswer.length} />
    </>
  );
}

/* ---------- enter a score ---------- */

type Slot = "partner" | "opp0" | "opp1";

export function NewMatch() {
  const { me } = useSession(); const nav = useNavigate(); const { toast } = useUi();
  const today = lagosToday();
  const home = me?.courts.find((c) => c.role === "home" && c.status === "approved");
  const [type, setType] = useState<"singles" | "doubles">("singles");
  const [date, setDate] = useState(today);
  const [courtId, setCourtId] = useState(home?.id ?? "");
  const [format, setFormat] = useState<FormatKey>("bo3");
  const [people, setPeople] = useState<Record<Slot, PublicUser | null>>({ partner: null, opp0: null, opp1: null });
  const [raw, setRaw] = useState<Array<[string, string]>>([["", ""], ["", ""], ["", ""]]);
  const [courts, setCourts] = useState<CourtRef[]>([]);
  const [picker, setPicker] = useState<Slot | null>(null);
  const [err, setErr] = useState(""); const [busy, setBusy] = useState(false);
  useEffect(() => { api.get<CourtRef[]>("/ref/courts").then(setCourts).catch(() => {}); }, []);
  if (!me) return <Loading />;

  const F = FORMATS[format];
  const score = evalScore(format, raw);
  const nameA = type === "doubles" ? [me.first, people.partner?.first].filter(Boolean).join(" & ") : me.first;
  const nameB = [people.opp0?.first, type === "doubles" ? people.opp1?.first : null].filter(Boolean).join(" & ") || "Opponent";
  let thirdOff = true;
  if (F.sets === 3) {
    const s1 = evalScore("set6", [raw[0]]), s2 = evalScore("set6", [raw[1]]);
    thirdOff = !(s1.winner && s2.winner && s1.winner !== s2.winner);
  }
  const ready = score.complete && !score.error && people.opp0 && (type === "singles" || (people.partner && people.opp1)) && courtId;
  const rows = F.kind === "stb" ? 1 : F.sets;

  const setCell = (i: number, j: 0 | 1, v: string) => setRaw(raw.map((r, k) => (k === i ? (j === 0 ? [v.replace(/\D/g, "").slice(0, 2), r[1]] : [r[0], v.replace(/\D/g, "").slice(0, 2)]) : r)) as any);

  const submit = async () => {
    setErr(""); setBusy(true);
    try {
      await api.post("/matches", {
        type, date, courtId, format,
        partner: type === "doubles" ? people.partner?.id : undefined,
        opponents: [people.opp0?.id, type === "doubles" ? people.opp1?.id : null].filter(Boolean),
        sets: raw.slice(0, rows).map((r, i) => (F.sets === 3 && i === 2 && thirdOff ? ["", ""] : r)),
      });
      const opp = [people.opp0, type === "doubles" ? people.opp1 : null].filter(Boolean) as PublicUser[];
      toast(`Score sent. ${opp.map((p) => p.first).join(" & ")} ${opp.length > 1 ? "have" : "has"} been notified.`);
      nav("/matches");
    } catch (e: any) { setErr(e.message); } finally { setBusy(false); }
  };

  const slot = (label: string, key: Slot) => {
    const u = people[key];
    return (
      <button className={"slot" + (u ? " filled" : "")} onClick={() => setPicker(key)}>
        {u ? <Avatar u={u} size={36} /> : <span className="av" style={{ width: 36, height: 36, display: "grid", placeItems: "center", color: "#aaa", fontSize: 20 }}>+</span>}
        <div style={{ flex: 1 }}><div className="lb">{label}</div><div style={{ fontWeight: 600 }}>{u ? fullName(u) : "Choose player"}</div>{u && <div className="id">{u.pid}</div>}</div>
      </button>
    );
  };
  const taken = [me.id, people.partner?.id, people.opp0?.id, people.opp1?.id].filter(Boolean) as string[];

  return (
    <>
      <TopBar title="Enter a score" back="/matches" />
      <main className="narrow">
        <div className="card">
          <label className="f" style={{ marginTop: 0 }}>Match type</label>
          <div className="seg">
            {(["singles", "doubles"] as const).map((t) => (
              <button key={t} className={type === t ? "on" : ""} onClick={() => { setType(t); if (t === "singles") setPeople({ ...people, partner: null, opp1: null }); }}>{t === "singles" ? "Singles" : "Doubles"}</button>
            ))}
          </div>
          <label className="f">Date</label>
          <input className="inp" type="date" value={date} min={addDaysISO(today, -14)} max={today} onChange={(e) => setDate(e.target.value)} />
          <div className="hint">Up to 14 days back.</div>
          <label className="f">Court</label>
          <select className="inp" value={courtId} onChange={(e) => setCourtId(e.target.value)}>
            <option value="">Choose court…</option>
            {courts.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
          <label className="f">Format</label>
          <div className="chips">
            {(Object.keys(FORMATS) as FormatKey[]).map((k) => <button key={k} className={"chip" + (format === k ? " on" : "")} onClick={() => { setFormat(k); setRaw([["", ""], ["", ""], ["", ""]]); }}>{FORMATS[k].label}</button>)}
          </div>
          <div className="hint">{F.sub}</div>
        </div>

        <div className="h2">Players</div>
        <div className="slot filled"><Avatar u={me} size={36} /><div style={{ flex: 1 }}><div className="lb">You</div><div style={{ fontWeight: 600 }}>{fullName(me)}</div><div className="id">{me.pid}</div></div></div>
        {type === "doubles" && slot("Your partner", "partner")}
        {slot(type === "doubles" ? "Opponent 1" : "Opponent", "opp0")}
        {type === "doubles" && slot("Opponent 2", "opp1")}

        <div className="h2">Score</div>
        <div className="card">
          <div className="teamhead"><span /><span>{nameA}</span><span>{nameB}</span></div>
          {Array.from({ length: rows }, (_, i) => {
            const off = F.sets === 3 && i === 2 && thirdOff;
            return (
              <div className="setrow" key={i} style={{ opacity: off ? 0.35 : 1 }}>
                <span className="lbl">{F.kind === "stb" ? "Points" : `Set ${i + 1}`}{F.sets === 3 && i === 2 && <div className="small" style={{ fontWeight: 400 }}>if 1-1</div>}</span>
                <input className="inp" inputMode="numeric" aria-label={`${nameA} ${F.kind === "stb" ? "points" : `set ${i + 1}`}`} disabled={off} value={off ? "" : raw[i][0]} onChange={(e) => setCell(i, 0, e.target.value)} />
                <input className="inp" inputMode="numeric" aria-label={`${nameB} ${F.kind === "stb" ? "points" : `set ${i + 1}`}`} disabled={off} value={off ? "" : raw[i][1]} onChange={(e) => setCell(i, 1, e.target.value)} />
              </div>
            );
          })}
          {score.error ? <div className="err">{score.error}</div> : score.winner && (
            <div style={{ marginTop: 6, fontWeight: 700, color: "var(--ok)" }}>🏆 {score.winner === "A" ? nameA : nameB} {(score.winner === "A" ? nameA : nameB).includes("&") ? "win" : "wins"} {scoreLine(score.sets, score.winner)}</div>
          )}
          <p className="hint">{F.kind === "stb" ? "First to 10, won by 2 (e.g. 10-8, 12-10)." : F.target === 6 ? "At 6-6 a tie-break is played: enter it as 7-6." : "At 4-4 a tie-break is played: enter it as 5-4."}</p>
        </div>
        <ErrorText msg={err} />
        <button className="btn" disabled={!ready || busy} onClick={submit}>{busy ? "Sending…" : "Submit for confirmation"}</button>
        <p className="hint" style={{ textAlign: "center", marginTop: 8 }}>{type === "doubles" ? "One opponent needs to accept within 7 days." : "Your opponent needs to accept within 7 days."}</p>
      </main>
      {picker && <PlayerPicker exclude={taken} onClose={() => setPicker(null)} onPick={(u) => { setPeople({ ...people, [picker]: u }); setPicker(null); }} />}
    </>
  );
}

function PlayerPicker({ exclude, onPick, onClose }: { exclude: string[]; onPick: (u: PublicUser) => void; onClose: () => void }) {
  const [q, setQ] = useState(""); const [favs, setFavs] = useState<PublicUser[] | null>(null); const [res, setRes] = useState<PublicUser[] | null>(null); const [err, setErr] = useState("");
  useEffect(() => { api.get<PublicUser[]>("/favourites").then(setFavs).catch(() => setFavs([])); }, []);
  useEffect(() => {
    if (!q.trim()) { setRes(null); return; }
    const t = setTimeout(() => api.get<PublicUser[]>(`/players?q=${encodeURIComponent(q.trim())}`).then(setRes).catch((e) => setErr(e.message)), 250);
    return () => clearTimeout(t);
  }, [q]);
  const row = (u: PublicUser) => (
    <div className="pl" key={u.id} style={{ cursor: "pointer" }} onClick={() => onPick(u)}>
      <Avatar u={u} size={38} /><div className="grow"><div className="nm">{fullName(u)}</div><div className="id">{u.pid}{u.homeCourt ? ` · ${u.homeCourt}` : ""}</div></div>
    </div>
  );
  const filt = (l: PublicUser[] | null) => (l ?? []).filter((u) => !exclude.includes(u.id));
  return (
    <div className="sheet-bg" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="sheet" role="dialog" aria-label="Add player">
        <h3>Add player</h3>
        <input className="inp" autoFocus placeholder="Search first name, last name or ID" value={q} onChange={(e) => setQ(e.target.value)} />
        <ErrorText msg={err} />
        <div style={{ marginTop: 6 }}>
          {res !== null ? (filt(res).length ? filt(res).map(row) : <div className="empty">No registered player matches "{q}".<br />Only players on 30-All can be added.</div>)
            : <><div className="h2">Favourites</div>{favs === null ? <Loading /> : filt(favs).length ? filt(favs).map(row) : <div className="empty">No favourites yet. Star players on their profile, or search above.</div>}</>}
        </div>
      </div>
    </div>
  );
}
