import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { addDaysISO, evalScore, FORMATS, lagosToday, MAX_BACKDATE_DAYS, type FormatKey } from "../../shared/rules";
import { api, type CourtRef, type Match, type PublicUser } from "../api";
import { Avatar, BottomNav, Calendar, ErrorText, fullName, Loading, ScoreCard, TopBar, usePresence, useSession, useUi } from "../ui";
import { CalendarDots, CaretRight, Plus, X } from "../icons";

/* ---------- helpers ---------- */

export function usePendingCount() {
  const [n, setN] = useState(0);
  const { me } = useSession();
  useEffect(() => {
    if (!me) return;
    api.get<Match[]>("/matches/pending").then((ms) => setN(ms.filter((m) => m.teamB.some((p) => p.id === me.id)).length)).catch(() => {});
  }, [me]);
  return n;
}

const parse = (iso: string) => new Date(iso + "T12:00:00Z");
const ordinal = (n: number) => n + (n % 10 === 1 && n !== 11 ? "ST" : n % 10 === 2 && n !== 12 ? "ND" : n % 10 === 3 && n !== 13 ? "RD" : "TH");

function dayLabel(iso: string, today: string) {
  const top = iso === today ? "Today" : iso === addDaysISO(today, -1) ? "Yesterday" : parse(iso).toLocaleDateString("en-GB", { weekday: "long", timeZone: "UTC" });
  const d = parse(iso);
  const bottom = `${ordinal(d.getUTCDate())} ${d.toLocaleDateString("en-GB", { month: "short", timeZone: "UTC" }).toUpperCase()}`;
  return { top, bottom };
}

function datesBetween(from: string, to: string): string[] {
  const out: string[] = [];
  for (let d = from; d <= to; d = addDaysISO(d, 1)) out.push(d);
  return out;
}

/* ---------- Me / All toggle ---------- */

function MeAllToggle({ value, onChange }: { value: "me" | "all"; onChange: (v: "me" | "all") => void }) {
  return (
    <div className="mtoggle" role="radiogroup" aria-label="Show matches">
      {(["me", "all"] as const).map((v) => (
        <button key={v} role="radio" aria-checked={value === v} className={value === v ? "on" : ""} onClick={() => onChange(v)}>{v === "me" ? "Me" : "All"}</button>
      ))}
    </div>
  );
}

/* ---------- date strip ---------- */

const CalIcon = () => <CalendarDots size={28} weight="bold" />;

function DateStrip({ dates, selected, onSelect, marked, today, onOpenCalendar }: {
  dates: string[]; selected: string; onSelect: (d: string) => void; marked: Set<string>; today: string; onOpenCalendar: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const first = useRef(true);
  // Keep the selected date in view: centered where possible, and today sits just left of the calendar icon.
  useLayoutEffect(() => {
    const box = ref.current, el = box?.querySelector<HTMLElement>(`[data-date="${selected}"]`);
    if (!box || !el) return;
    const iconW = 64;
    const target = el.offsetLeft - (box.clientWidth - iconW - el.offsetWidth) / 2;
    box.scrollTo({ left: Math.max(0, target), behavior: first.current ? "auto" : "smooth" });
    first.current = false;
  }, [selected, dates.length]);
  return (
    <div className="dstrip-band"><div className="dstrip-wrap">
      <div className="dstrip" ref={ref}>
        {dates.map((d) => {
          const { top, bottom } = dayLabel(d, today);
          return (
            <button key={d} data-date={d} className={"dday" + (d === selected ? " sel" : "")} aria-pressed={d === selected} onClick={() => onSelect(d)}>
              <span className="dtop">{top}</span>
              <span className="dbot">{bottom}</span>
              {marked.has(d) && <i className="ddot" title="Has matches" />}
            </button>
          );
        })}
      </div>
      <div className="dfade" aria-hidden="true" />
      <button className="dcal" aria-label="Pick a date" onClick={onOpenCalendar}><CalIcon /></button>
    </div></div>
  );
}

function DatePickerModal({ selected, min, max, marked, onPick, onClose }: {
  selected: string; min: string; max: string; marked: Set<string>; onPick: (d: string) => void; onClose: () => void;
}) {
  const { state, close } = usePresence(onClose, 160);
  const d = parse(selected);
  const [month, setMonth] = useState({ y: d.getUTCFullYear(), m: d.getUTCMonth() });
  useEffect(() => {
    const esc = (e: KeyboardEvent) => e.key === "Escape" && close();
    window.addEventListener("keydown", esc); return () => window.removeEventListener("keydown", esc);
  }, [close]);
  return (
    <div className="dialog-bg" data-state={state} onClick={(e) => e.target === e.currentTarget && close()}>
      <div className="dialog datepick" data-state={state} role="dialog" aria-modal="true" aria-label="Pick a date">
        <Calendar month={month} onMonth={setMonth} days={marked} selected={selected} min={min} max={max} onSelect={(x) => { if (x) close(() => onPick(x)); }} />
        <button className="btn ghost" style={{ marginTop: 12 }} onClick={() => close()}>Close</button>
      </div>
    </div>
  );
}

/* ---------- empty state: Love-Love scoreboard ---------- */

function LoveLove() {
  return (
    <div className="lovelove">
      <svg className="love-love-scoreboard" width="120" height="100" viewBox="0 0 240 200" role="img" aria-label="Scoreboard reading 0–0">
        <rect x="58" y="146" width="8" height="40" fill="#B5B0AA" />
        <rect x="174" y="146" width="8" height="40" fill="#B5B0AA" />
        <line x1="24" y1="186" x2="216" y2="186" stroke="#1A1A1A" strokeWidth="3" strokeLinecap="round" />
        <rect x="28" y="30" width="184" height="120" rx="14" fill="#DDD9D3" />
        <rect x="40" y="42" width="160" height="96" rx="8" fill="#F3F1EE" />
        <text x="80" y="62" textAnchor="middle" fontFamily="Inter, sans-serif" fontSize="14" fontWeight="700" letterSpacing="1.5" fill="#6B6661">YOU</text>
        <text x="160" y="62" textAnchor="middle" fontFamily="Inter, sans-serif" fontSize="14" fontWeight="700" letterSpacing="1.5" fill="#6B6661">OPP</text>
        <text className="ll-flick" x="80" y="122" textAnchor="middle" fontFamily="Inter, sans-serif" fontSize="50" fontWeight="800" fill="#FF751F">0</text>
        <text className="ll-flick2" x="160" y="122" textAnchor="middle" fontFamily="Inter, sans-serif" fontSize="50" fontWeight="800" fill="#FF751F">0</text>
        <g className="ll-blink">
          <circle cx="120" cy="92" r="4" fill="#1A1A1A" />
          <circle cx="120" cy="110" r="4" fill="#1A1A1A" />
        </g>
      </svg>
      <h2>Still Love-Love</h2>
      <p>
        Log a{" "}
        <span style={{ position: "relative", display: "inline-block" }}>match
          <svg width="112.5" height="135" viewBox="0 0 150 180" aria-hidden="true" style={{ position: "absolute", left: "50%", top: "100%", overflow: "visible" }}>
            <path d="M0 6 C -2 44, 34 72, 70 96 C 100 116, 112 152, 134 174" fill="none" stroke="#8E8D8D" strokeWidth="3.2" strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
            <path d="M116 169 Q 125 172, 134 174 Q 132 165, 129 156" fill="none" stroke="#8E8D8D" strokeWidth="3.2" strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
          </svg>
        </span>{" "}now
      </p>
    </div>
  );
}

/* ---------- score card ---------- */

/* ---------- pending scores ---------- */

function PendingSheet({ pending, onClose, onChanged }: { pending: Match[]; onClose: () => void; onChanged: () => void }) {
  const { me } = useSession(); const { toast, confirm } = useUi();
  const { state, close } = usePresence(onClose, 280);
  const [leaving, setLeaving] = useState<string | null>(null);
  if (!me) return null;
  const toAnswer = pending.filter((m) => m.teamB.some((p) => p.id === me.id));
  const waiting = pending.filter((m) => m.teamA.some((p) => p.id === me.id));
  const act = async (m: Match, action: "accept" | "reject" | "delete") => {
    try {
      if (action === "delete") await api.del(`/matches/${m.id}`); else await api.post(`/matches/${m.id}/${action}`);
      toast(action === "accept" ? "Score accepted. Everyone in the match has been notified." : action === "reject" ? "Score rejected. Everyone in the match has been notified." : "Pending score deleted.");
      setLeaving(m.id); // fold the answered card away, then refresh the list
      setTimeout(onChanged, 300);
    } catch (e: any) { toast(e.message); }
  };
  const item = (m: Match) => (
    <div key={m.id} className="leave-wrap" data-leaving={leaving === m.id || undefined}><div className="leave-inner"><ScoreCard m={m} showDate actions={actions(m)} /></div></div>
  );
  const actions = (m: Match) => {
    if (m.teamB.some((p) => p.id === me.id)) return (
      <div className="acts">
        <button className="btn sm bad" onClick={() => confirm({ title: "Reject this score?", body: "It won't be recorded. Everyone in the match will be told, and it can be entered again.", ok: "Reject", danger: true, onOk: () => act(m, "reject") })}>Reject</button>
        <button className="btn sm ok" onClick={() => act(m, "accept")}>Accept score</button>
      </div>
    );
    if (m.submittedBy === me.id) return <div className="acts"><button className="btn sm ghost" onClick={() => confirm({ title: "Delete this pending score?", body: "Your opponents won't see it any more. You can enter the correct score again.", ok: "Delete", danger: true, onOk: () => act(m, "delete") })}>Delete & re-enter</button></div>;
    return <p className="small" style={{ marginTop: 8 }}>Your partner entered this. Waiting for an opponent to accept.</p>;
  };
  return (
    <div className="sheet-bg" data-state={state} onClick={(e) => e.target === e.currentTarget && close()}>
      <div className="sheet" data-state={state} role="dialog" aria-modal="true" aria-label="Pending scores">
        <div className="sheet-head"><h3>Pending scores</h3><button className="xbtn" aria-label="Close" onClick={() => close()}><X size={20} weight="bold" /></button></div>
        {toAnswer.length > 0 && <><div className="h2">Needs your answer ({toAnswer.length})</div>{toAnswer.map(item)}</>}
        {waiting.length > 0 && <><div className="h2">Waiting on opponents</div>{waiting.map(item)}</>}
        {pending.length === 0 && <div className="empty">Nothing pending. Every score has been answered.</div>}
        <p className="small" style={{ textAlign: "center", marginTop: 6 }}>Scores not accepted within 7 days are rejected automatically.</p>
      </div>
    </div>
  );
}

/* ---------- page ---------- */

export function Matches() {
  const { me } = useSession();
  const today = lagosToday();
  const [scope, setScope] = useState<"me" | "all">("me");
  const [date, setDate] = useState(today);
  const [list, setList] = useState<Match[] | null>(null);
  const [days, setDays] = useState<{ first: string | null; days: string[] }>({ first: null, days: [] });
  const [pending, setPending] = useState<Match[]>([]);
  const [calOpen, setCalOpen] = useState(false);
  const [pendOpen, setPendOpen] = useState(false);
  const [adding, setAdding] = useState(false);

  const [loadingDay, setLoadingDay] = useState(false);
  const [shownKey, setShownKey] = useState("");
  const loadDay = useCallback(() => {
    // Keep the current cards on screen (dimmed) while the next day loads, so nothing flashes.
    setLoadingDay(true);
    const key = `${date}|${scope}`;
    api.get<Match[]>(`/matches/day?date=${date}&scope=${scope}`)
      .then((l) => { setList(l); setShownKey(key); })
      .catch(() => { setList([]); setShownKey(key); })
      .finally(() => setLoadingDay(false));
  }, [date, scope]);
  const loadPending = useCallback(() => api.get<Match[]>("/matches/pending").then(setPending).catch(() => {}), []);
  const loadDays = useCallback(() => api.get<{ first: string | null; days: string[] }>(`/matches/days?scope=${scope}`).then(setDays).catch(() => {}), [scope]);
  useEffect(() => { loadDay(); }, [loadDay]);
  useEffect(() => { loadDays(); }, [loadDays]);
  useEffect(() => { loadPending(); }, [loadPending]);

  // The strip goes back to the first match ever logged (at least two weeks, so there's always room to slide).
  const start = useMemo(() => {
    const twoWeeks = addDaysISO(today, -MAX_BACKDATE_DAYS);
    return days.first && days.first < twoWeeks ? days.first : twoWeeks;
  }, [days.first, today]);
  const dates = useMemo(() => datesBetween(start, today), [start, today]);
  const marked = useMemo(() => new Set(days.days), [days.days]);

  if (!me) return <Loading />;
  const toAnswer = pending.filter((m) => m.teamB.some((p) => p.id === me.id)).length;
  const waiting = pending.length - toAnswer;

  return (
    <>
      <div className="mscreen">
        {/* title and days stay pinned while the matches scroll */}
        <div className="mstick">
          <TopBar title="Matches" right={<MeAllToggle value={scope} onChange={setScope} />} />
          <DateStrip dates={dates} selected={date} onSelect={setDate} marked={marked} today={today} onOpenCalendar={() => setCalOpen(true)} />
        </div>
        <main className="mmain">
          {pending.length > 0 && (
            <button className={"pbanner" + (toAnswer ? " urgent" : "")} onClick={() => setPendOpen(true)}>
              <span>
                {toAnswer > 0 && <b>{toAnswer} score{toAnswer === 1 ? "" : "s"} need{toAnswer === 1 ? "s" : ""} your answer</b>}
                {toAnswer > 0 && waiting > 0 && " · "}
                {waiting > 0 && `${waiting} waiting on opponent${waiting === 1 ? "" : "s"}`}
              </span>
              <CaretRight size={18} weight="bold" aria-hidden="true" />
            </button>
          )}
          {list === null ? <Loading /> : (
            <div key={shownKey} className="dayview" data-loading={loadingDay || undefined} aria-busy={loadingDay}>
              {list.length === 0 ? <LoveLove /> : (
                <>
                  {list.map((m) => <ScoreCard key={m.id} m={m} />)}
                  <button className="pnote" onClick={() => setPendOpen(true)}>Can't find a match? It might still be pending</button>
                </>
              )}
            </div>
          )}
        </main>
        <button className="fab" aria-label="Add a score" onClick={() => setAdding(true)}>
          <Plus size={30} weight="bold" color="#fff" />
        </button>
      </div>
      <BottomNav pending={toAnswer} />
      {calOpen && <DatePickerModal selected={date} min={start} max={today} marked={marked} onClose={() => setCalOpen(false)} onPick={(d) => { setDate(d); setCalOpen(false); }} />}
      {pendOpen && <PendingSheet pending={pending} onClose={() => setPendOpen(false)} onChanged={() => { loadPending(); loadDay(); loadDays(); }} />}
      {adding && <AddScoreDrawer defaultDate={date} onClose={() => setAdding(false)} onSubmitted={() => { setAdding(false); loadPending(); }} />}
    </>
  );
}

/* ---------- add score drawer (2 steps) ---------- */

type Slot = "partner" | "opp0" | "opp1";

function AddScoreDrawer({ defaultDate, onClose, onSubmitted }: { defaultDate: string; onClose: () => void; onSubmitted: () => void }) {
  const { me } = useSession(); const { toast } = useUi();
  const { state, close } = usePresence(onClose, 280);
  const today = lagosToday();
  const minDate = addDaysISO(today, -MAX_BACKDATE_DAYS);
  const tooOld = defaultDate < minDate;
  const home = me?.courts.find((c) => c.role === "home" && c.status === "approved");

  const [phase, setPhase] = useState<1 | 2>(1);
  const [type, setType] = useState<"singles" | "doubles">("singles");
  const [date, setDate] = useState(tooOld ? today : defaultDate);
  const [courtId, setCourtId] = useState(home?.id ?? "");
  const [format, setFormat] = useState<FormatKey>("bo3");
  const [courts, setCourts] = useState<CourtRef[]>([]);
  const [people, setPeople] = useState<Record<Slot, PublicUser | null>>({ partner: null, opp0: null, opp1: null });
  const [raw, setRaw] = useState<Array<[string, string]>>([["", ""], ["", ""], ["", ""]]);
  const [picker, setPicker] = useState<Slot | null>(null);
  const [err, setErr] = useState(""); const [busy, setBusy] = useState(false);
  useEffect(() => { api.get<CourtRef[]>("/ref/courts").then(setCourts).catch(() => {}); }, []);
  useEffect(() => {
    const esc = (e: KeyboardEvent) => e.key === "Escape" && !picker && close();
    window.addEventListener("keydown", esc); return () => window.removeEventListener("keydown", esc);
  }, [close, picker]);
  if (!me) return null;

  const F = FORMATS[format];
  const cols = F.kind === "stb" ? 1 : F.sets;
  const score = evalScore(format, raw);
  let thirdOff = true;
  if (F.sets === 3) {
    const s1 = evalScore("set6", [raw[0]]), s2 = evalScore("set6", [raw[1]]);
    thirdOff = !(s1.winner && s2.winner && s1.winner !== s2.winner);
  }
  const isD = type === "doubles";
  const playersReady = !!people.opp0 && (!isD || (!!people.partner && !!people.opp1));
  const ready = score.complete && !score.error && playersReady;
  const setCell = (i: number, j: 0 | 1, v: string) =>
    setRaw(raw.map((r, k) => (k === i ? (j === 0 ? [v.replace(/\D/g, "").slice(0, 2), r[1]] : [r[0], v.replace(/\D/g, "").slice(0, 2)]) : r)) as any);
  const taken = [me.id, people.partner?.id, people.opp0?.id, people.opp1?.id].filter(Boolean) as string[];
  const teamA = [me.first, isD ? people.partner?.first : null].filter(Boolean).join(" & ");
  const teamB = [people.opp0?.first, isD ? people.opp1?.first : null].filter(Boolean).join(" & ") || (isD ? "Team 2" : "Player 2");

  const next = () => {
    setErr("");
    if (!courtId) return setErr("Choose the court you played on");
    if (date < minDate || date > today) return setErr(`Pick a date within the last ${MAX_BACKDATE_DAYS} days`);
    setPhase(2);
  };
  const submit = async () => {
    setErr(""); setBusy(true);
    try {
      await api.post("/matches", {
        type, date, courtId, format,
        partner: isD ? people.partner?.id : undefined,
        opponents: [people.opp0?.id, isD ? people.opp1?.id : null].filter(Boolean),
        sets: raw.slice(0, cols).map((r, i) => (F.sets === 3 && i === 2 && thirdOff ? ["", ""] : r)),
      });
      const opp = [people.opp0, isD ? people.opp1 : null].filter(Boolean) as PublicUser[];
      toast(`Score sent. ${opp.map((p) => p.first).join(" & ")} ${opp.length > 1 ? "have" : "has"} been notified.`);
      close(onSubmitted);
    } catch (e: any) { setErr(e.message); } finally { setBusy(false); }
  };

  const winner = !score.error && playersReady ? score.winner : undefined;
  const playerRow = (u: PublicUser | null, label: string, team: "A" | "B", slot?: Slot) => u ? (
    <button className={"se-row" + (winner && winner !== team ? " lost" : "")} disabled={!slot} onClick={() => slot && setPicker(slot)}>
      <Avatar u={u} size={40} />
      <span className="se-who"><b>{fullName(u)}</b><small>{label}</small></span>
      {winner === team && <span className="se-win">WIN</span>}
      {slot && <span className="se-change">Change</span>}
    </button>
  ) : (
    <button className="se-row" onClick={() => slot && setPicker(slot)}>
      <span className="se-plus" aria-hidden="true"><Plus size={20} weight="bold" /></span>
      <span className="se-who"><b>Add Player</b><small>{label}</small></span>
    </button>
  );

  return (
    <div className="sheet-bg" data-state={state} onClick={(e) => e.target === e.currentTarget && close()}>
      <div className="sheet addsheet" data-state={state} role="dialog" aria-modal="true" aria-label="Add a score">
        <div className="grabber" aria-hidden="true" />
        <div className="sheet-head">
          <h3>{phase === 1 ? "Add a score" : "Score"}</h3>
          <span className="small">Step {phase} of 2</span>
          <button className="xbtn" aria-label="Close" onClick={() => close()}><X size={20} weight="bold" /></button>
        </div>

        {phase === 1 ? (
          <>
            <label className="f" style={{ marginTop: 0 }}>Match type</label>
            <div className="seg">
              {(["singles", "doubles"] as const).map((t) => (
                <button key={t} className={type === t ? "on" : ""} onClick={() => setType(t)}>{t === "singles" ? "Singles" : "Doubles"}</button>
              ))}
            </div>
            <label className="f">Date</label>
            <input className="inp" type="date" value={date} min={minDate} max={today} onChange={(e) => setDate(e.target.value)} />
            {tooOld && <div className="hint">Scores can only be logged for the last {MAX_BACKDATE_DAYS} days, so this is set to today.</div>}
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
            <ErrorText msg={err} />
            <button className="btn" style={{ marginTop: 18 }} onClick={next}>Continue</button>
          </>
        ) : (
          <>
            <div className="se">
              {playerRow(me, isD ? "TEAM 1" : "PLAYER 1", "A")}
              {isD && playerRow(people.partner, "TEAM 1", "A", "partner")}
              <div className="se-score" style={{ gridTemplateColumns: `repeat(${cols}, 56px)` }}>
                {Array.from({ length: cols }, (_, i) => {
                  const off = F.sets === 3 && i === 2 && thirdOff;
                  const label = F.kind === "stb" ? "TIE-BREAK" : `SET ${i + 1}`;
                  return (
                    <div key={i} className="se-col" style={{ opacity: off ? 0.35 : 1 }}>
                      <span className="se-lbl">{label}</span>
                      <input inputMode="numeric" aria-label={`${teamA}, ${label}`} disabled={off} value={off ? "" : raw[i][0]} onChange={(e) => setCell(i, 0, e.target.value)} />
                      <input inputMode="numeric" aria-label={`${teamB}, ${label}`} disabled={off} value={off ? "" : raw[i][1]} onChange={(e) => setCell(i, 1, e.target.value)} />
                    </div>
                  );
                })}
              </div>
              {playerRow(people.opp0, isD ? "TEAM 2" : "PLAYER 2", "B", "opp0")}
              {isD && playerRow(people.opp1, "TEAM 2", "B", "opp1")}
            </div>
            {score.error && <div className="err" style={{ textAlign: "center" }}>{score.error}</div>}
            <ErrorText msg={err} />
            <div className="row" style={{ marginTop: 16 }}>
              <button className="btn ghost" onClick={() => { setErr(""); setPhase(1); }}>Back</button>
              <button className="btn" disabled={!ready || busy} onClick={submit}>{busy ? "Sending…" : "Submit score"}</button>
            </div>
            <p className="hint" style={{ textAlign: "center", marginTop: 8 }}>{isD ? "One opponent needs to accept within 7 days." : "Your opponent needs to accept within 7 days."}</p>
          </>
        )}
      </div>
      {picker && <PlayerPicker exclude={taken} onClose={() => setPicker(null)} onPick={(u) => { setPeople({ ...people, [picker]: u }); setPicker(null); }} />}
    </div>
  );
}

function PlayerPicker({ exclude, onPick, onClose }: { exclude: string[]; onPick: (u: PublicUser) => void; onClose: () => void }) {
  const { state, close } = usePresence(onClose, 280);
  const [q, setQ] = useState(""); const [favs, setFavs] = useState<PublicUser[] | null>(null); const [res, setRes] = useState<PublicUser[] | null>(null); const [err, setErr] = useState("");
  useEffect(() => { api.get<PublicUser[]>("/favourites").then(setFavs).catch(() => setFavs([])); }, []);
  useEffect(() => {
    if (!q.trim()) { setRes(null); return; }
    const t = setTimeout(() => api.get<PublicUser[]>(`/players?q=${encodeURIComponent(q.trim())}`).then(setRes).catch((e) => setErr(e.message)), 250);
    return () => clearTimeout(t);
  }, [q]);
  const row = (u: PublicUser) => (
    <div className="pl" key={u.id} style={{ cursor: "pointer" }} onClick={() => close(() => onPick(u))}>
      <Avatar u={u} size={38} /><div className="grow"><div className="nm">{fullName(u)}</div><div className="id">{u.pid}{u.homeCourt ? ` · ${u.homeCourt}` : ""}</div></div>
    </div>
  );
  const filt = (l: PublicUser[] | null) => (l ?? []).filter((u) => !exclude.includes(u.id));
  return (
    <div className="sheet-bg" data-state={state} style={{ zIndex: 25 }} onClick={(e) => { e.stopPropagation(); if (e.target === e.currentTarget) close(); }}>
      <div className="sheet" data-state={state} role="dialog" aria-modal="true" aria-label="Add player">
        <div className="sheet-head"><h3>Add player</h3><button className="xbtn" aria-label="Close" onClick={() => close()}><X size={20} weight="bold" /></button></div>
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
