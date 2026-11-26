import { Fragment, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { api, type CourtRef, type PlayerProfile, type PublicUser, type Racquet } from "../api";
import { flagUrl } from "../../shared/flags";
import { ActivityCard } from "../activity";
import { celebrated, confetti } from "../confetti";
import { lagosToday } from "../../shared/rules";
import { Avatar, BottomNav, ErrorText, fullName, Loading, RecordBlock, ScoreCard, TopBar, useSession } from "../ui";
import { usePendingCount } from "./Matches";
import { Fire, Lock, MagnifyingGlass, Star, X } from "../icons";

interface LbRow extends PublicUser { rank: number; pts: number; won: number; lost: number; streak: number }

/** What it takes to pass the player directly above you, in show-up points (a singles win is 3). */
function nextStep(me: LbRow | undefined, above: LbRow | undefined): ReactNode {
  if (!me) return null;
  if (me.won + me.lost === 0) return <>Log your first match to get on the board. <b>A singles win earns 3</b>, and even a loss earns 1.</>;
  if (!above) return <>You're <b>top of the table</b>. Keep logging matches to stay there.</>;
  const gap = above.pts - me.pts;
  if (gap <= 0) return <>Level on points with {above.first} (#{above.rank}). <b>One win</b> puts you above.</>;
  const wins = Math.floor(gap / 3) + 1;
  return <><b>{gap} point{gap > 1 ? "s" : ""}</b> behind {above.first} (#{above.rank}). <b>Win {wins} singles match{wins > 1 ? "es" : ""}</b> to pass {above.first}.</>;
}

/** The Players tab: this season's leaderboard, opened with your own row in the middle of the screen. */
export function Players() {
  const { me } = useSession(); const pending = usePendingCount();
  const [data, setData] = useState<{ season: string; players: LbRow[] } | null>(null);
  const [err, setErr] = useState("");
  const [searching, setSearching] = useState(false);
  const [q, setQ] = useState("");
  const meRow = useRef<HTMLAnchorElement>(null);
  const centred = useRef(false);
  useEffect(() => { api.get<{ season: string; players: LbRow[] }>("/leaderboard").then(setData).catch((e) => setErr(e.message)); }, []);

  // open with your row in the middle of the screen (and come back to it when a search is cleared)
  const centre = () => {
    const el = meRow.current; if (!el) return;
    const r = el.getBoundingClientRect();
    window.scrollTo({ top: window.scrollY + r.top - window.innerHeight / 2 + r.height / 2 });
  };
  useLayoutEffect(() => { if (data && !centred.current) { centred.current = true; centre(); } }, [data]);

  // celebrate climbing (a small pop from your row, at most once a day) and reaching #1 (a big burst)
  const [climb, setClimb] = useState(0);
  const [topSpot, setTopSpot] = useState(false);
  useEffect(() => {
    if (!data || !me) return;
    const mine = data.players.find((r) => r.id === me.id);
    if (!mine || mine.won + mine.lost === 0) return;
    const prev = Number(celebrated.get(me.id, "rank") ?? 0), today = lagosToday();
    celebrated.mark(me.id, "rank", String(mine.rank));
    if (mine.rank === 1 && prev !== 1) { setTopSpot(true); setTimeout(() => confetti("big"), 300); return; }
    if (prev > mine.rank && celebrated.get(me.id, "climb-day") !== today) {
      celebrated.mark(me.id, "climb-day", today);
      setClimb(prev - mine.rank);
      setTimeout(() => confetti("small", meRow.current), 450);
    }
  }, [data]);
  useEffect(() => { if (data && !q) centre(); }, [q]);

  if (!me) return <Loading />;
  const rows = data?.players ?? [];
  const mineIdx = rows.findIndex((r) => r.id === me.id);
  const mine = rows[mineIdx], above = mineIdx > 0 ? rows[mineIdx - 1] : undefined;
  const needle = q.trim().toLowerCase();
  const shown = needle ? rows.filter((r) => fullName(r).toLowerCase().includes(needle) || r.pid.toLowerCase().includes(needle)) : rows;

  return (
    <>
      <TopBar title="Players" right={
        <button className={"iconbtn" + (searching ? " on" : "")} aria-label={searching ? "Close search" : "Search players"} aria-expanded={searching}
          onClick={() => { setSearching(!searching); if (searching) setQ(""); }}>
          {searching ? <X size={20} weight="bold" /> : <MagnifyingGlass size={20} weight="bold" />}
        </button>} />
      <main className="lb">
        {searching && (
          <div className="lb-search">
            <MagnifyingGlass size={18} aria-hidden="true" />
            <input type="search" autoFocus placeholder="Search by name or player ID" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search players" />
          </div>
        )}
        <ErrorText msg={err} />
        {!data ? <Loading /> : (
          <>
            {topSpot && mine && (
              <section className="cel-card top1" role="status">
                <button className="cel-x" aria-label="Dismiss" onClick={() => setTopSpot(false)}><X size={18} weight="bold" /></button>
                <span className="cel-num">#1</span>
                <b>You're top of the table</b>
                <span>{data.season} season · {mine.pts} points</span>
              </section>
            )}
            <div className="lb-head" aria-hidden="true"><span>Pos</span><span>Player</span><span>Streak</span><span>Pts</span></div>
            <div className="card lb-list">
              {shown.map((r) => {
                const isMe = r.id === me.id, isTarget = !needle && above?.id === r.id;
                return (
                  <Link key={r.id} ref={isMe ? meRow : undefined} to={isMe ? "/me" : `/players/${r.id}`}
                    className={"lb-row" + (isMe ? " me" : "") + (isTarget ? " target" : "")}>
                    <span className="lb-pos">{r.rank}</span>
                    <Avatar u={r} size={36} />
                    <span className="lb-who">
                      <span className="lb-nm"><span>{fullName(r)}</span>{isMe && <i className="me-pill">You</i>}{isMe && climb > 0 && <i className="lb-up" aria-label={`Up ${climb} places`}>▲{climb}</i>}</span>
                      <span className="lb-wl">{r.won}W, {r.lost}L</span>
                      {isTarget && <span className="lb-tgt">Your next target</span>}
                    </span>
                    <span className={"lb-fl" + (r.streak ? "" : " off")} title={`${r.streak}-week streak`}><Fire size={14} weight="fill" />{r.streak}</span>
                    <span className="lb-pts">{r.pts}</span>
                    {isMe && !needle && <span className="lb-next">{climb > 0 && <>You climbed {climb} place{climb > 1 ? "s" : ""} since your last visit. </>}{nextStep(mine, above)}</span>}
                  </Link>
                );
              })}
              {shown.length === 0 && <div className="empty">No players match "{q.trim()}".</div>}
            </div>
            <p className="lb-foot">{data.season} season · Singles win 3 · Doubles win 2 · Any loss 1. Only confirmed scores count, and only your first 3 matches a month against the same opponent earn points.</p>
          </>
        )}
      </main>
      <BottomNav pending={pending} />
    </>
  );
}

export function ProfileSections({ u, courts, racquets, record, activity, mine = false, private: priv }: {
  u: PublicUser; courts: CourtRef[]; racquets: Racquet[]; record?: PlayerProfile["record"];
  activity?: PlayerProfile["activity"]; mine?: boolean;
  private?: { gender: string | null; dob: string | null; height: string; whatsapp: string | null; email: string };
}) {
  const home = courts.find((c) => c.role === "home");
  const sec = courts.filter((c) => c.role === "secondary");
  const cLine = (c?: CourtRef) => c ? <>{c.name} {c.status === "pending" && <span className="pill pend">Pending approval</span>}</> : "—";
  return (
    <>
      <div className="prohead">
        <Avatar u={u} size={96} />
        {/* the flag rides on the surname so a long name never wraps it onto a line of its own */}
        <h1 className="nm">{u.first} <span className="nm-last">{u.last}{flagUrl(u.nationality) && <img className="flag" src={flagUrl(u.nationality)!} alt={u.nationality ?? ""} title={u.nationality ?? ""} width={24} height={16} />}</span></h1>
        {!mine && <div className="pid">ID: {u.pid}</div>}
      </div>
      {record && <RecordBlock record={record} />}
      {activity && <ActivityCard a={activity} first={u.first} mine={mine} uid={u.id} />}
      <div className="h2">Tennis</div>
      <div className="card dlist">
        <div className="drow"><span>Home court</span><b>{cLine(home)}</b></div>
        {sec.map((c, i) => <div className="drow" key={c.id}><span>{i === 0 ? "Also plays at" : ""}</span><b>{cLine(c)}</b></div>)}
        {racquets.map((r, i) => <div className="drow" key={"r" + i}><span>{r.primary ? "Racquet" : i === 1 || (i === 0 && !r.primary) ? "Other racquets" : ""}</span><b>{r.brand} {r.model}</b></div>)}
        <div className="drow"><span>Plays</span><b>{u.hand ? `${u.hand}-handed` : "—"}{u.backhand ? `, ${u.backhand.toLowerCase()} backhand` : ""}</b></div>
        <div className="drow"><span>Favourite shot</span><b>{u.shot ?? "—"}</b></div>
      </div>
      {priv && (
        <>
          <div className="h2 h2-icon"><Lock size={16} weight="fill" /> Only you can see this</div>
          <div className="card dlist">
            <div className="drow"><span>Gender</span><b>{priv.gender ?? "—"}</b></div>
            <div className="drow"><span>Date of birth</span><b>{priv.dob ? new Date(priv.dob + "T12:00:00").toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }) : "—"}</b></div>
            <div className="drow"><span>Height</span><b>{priv.height}</b></div>
            <div className="drow"><span>WhatsApp</span><b>{priv.whatsapp || "—"}</b></div>
            <div className="drow"><span>Email</span><b style={{ wordBreak: "break-all" }}>{priv.email}</b></div>
          </div>
          <p className="small" style={{ margin: "8px 4px 0" }}>Admins can also see your date of birth and WhatsApp.</p>
        </>
      )}
    </>
  );
}

export function Player() {
  const { id } = useParams(); const { me, refresh } = useSession(); const nav = useNavigate(); const pending = usePendingCount();
  const [popped, setPopped] = useState(false);
  const [p, setP] = useState<PlayerProfile | null>(null); const [err, setErr] = useState("");
  const load = () => api.get<PlayerProfile>(`/players/${id}`).then(setP).catch((e) => setErr(e.message));
  useEffect(() => { if (id === me?.id) nav("/me", { replace: true }); else load(); }, [id]);
  if (err) return <><TopBar title="Player" back="/players" /><main><ErrorText msg={err} /></main></>;
  if (!p || !me) return <Loading />;
  const toggle = async () => { setPopped(!p.isFavourite); if (p.isFavourite) await api.del(`/favourites/${p.id}`); else await api.put(`/favourites/${p.id}`); load(); refresh(); };
  return (
    <>
      <TopBar title={p.first} back={() => nav(-1)} />
      <main className="wide">
       <div className="cols">
       <section>
        <div style={{ textAlign: "right" }}><button className={"btn sm favbtn" + (p.isFavourite ? "" : " ghost")} data-pop={popped && p.isFavourite ? "" : undefined} onClick={toggle}><Star size={16} weight={p.isFavourite ? "fill" : "regular"} /> {p.isFavourite ? "Favourite" : "Add to favourites"}</button></div>
        <ProfileSections u={p} courts={p.courts} racquets={p.racquets} record={p.record} activity={p.activity} />
       </section>
       <section>
        <div className="h2">Head-to-head: you vs {p.first}</div>
        <div className="card" style={{ textAlign: "center" }}>
          <div style={{ display: "flex", justifyContent: "space-around", alignItems: "center" }}>
            <div><Avatar u={me} size={44} /><div style={{ fontSize: 28, fontWeight: 800 }}>{p.h2h.myWins}</div><div className="small">{me.first}</div></div>
            <div className="small">{p.h2h.played} match{p.h2h.played === 1 ? "" : "es"}</div>
            <div><Avatar u={p} size={44} /><div style={{ fontSize: 28, fontWeight: 800 }}>{p.h2h.played - p.h2h.myWins}</div><div className="small">{p.first}</div></div>
          </div>
        </div>
        {p.h2h.matches.map((m) => <ScoreCard key={m.id} m={m} showDate />)}
       </section>
       </div>
      </main>
      <BottomNav pending={pending} />
    </>
  );
}
