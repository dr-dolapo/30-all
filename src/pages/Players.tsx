import { Fragment, useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { api, type CourtRef, type PlayerProfile, type PublicUser, type Racquet } from "../api";
import { Avatar, BottomNav, ErrorText, fullName, Loading, MatchCard, TopBar, useSession } from "../ui";
import { usePendingCount } from "./Matches";
import { Star } from "../icons";

export function Players() {
  const { me, refresh } = useSession(); const pending = usePendingCount();
  const [q, setQ] = useState("");
  const [all, setAll] = useState<PublicUser[] | null>(null);
  const [res, setRes] = useState<PublicUser[] | null>(null);
  useEffect(() => { api.get<PublicUser[]>("/players").then(setAll).catch(() => setAll([])); }, []);
  useEffect(() => {
    if (!q.trim()) { setRes(null); return; }
    const t = setTimeout(() => api.get<PublicUser[]>(`/players?q=${encodeURIComponent(q.trim())}`).then(setRes).catch(() => setRes([])), 250);
    return () => clearTimeout(t);
  }, [q]);
  if (!me) return <Loading />;
  const toggle = async (id: string) => {
    if (me.favourites.includes(id)) await api.del(`/favourites/${id}`); else await api.put(`/favourites/${id}`);
    refresh();
  };
  const row = (u: PublicUser) => (
    <div className="pl" key={u.id}>
      <Avatar u={u} size={42} />
      <Link to={`/players/${u.id}`} className="grow" style={{ textDecoration: "none" }}><div className="nm">{fullName(u)}</div><div className="id">{u.pid}{u.homeCourt ? ` · ${u.homeCourt}` : ""}</div></Link>
      <button className={"star" + (me.favourites.includes(u.id) ? " on" : "")} aria-label={me.favourites.includes(u.id) ? "Remove from favourites" : "Add to favourites"} onClick={() => toggle(u.id)}><Star size={22} weight={me.favourites.includes(u.id) ? "fill" : "regular"} /></button>
    </div>
  );
  const favs = (all ?? []).filter((u) => me.favourites.includes(u.id));
  return (
    <>
      <TopBar title="Players" />
      <main>
        <input className="inp" placeholder="Search by first name, last name or ID" value={q} onChange={(e) => setQ(e.target.value)} />
        {res !== null ? (
          <><div className="h2" style={{ marginTop: 16 }}>Results</div><div className="card" style={{ padding: "4px 14px" }}>{res.length ? res.map(row) : <div className="empty">No players found.</div>}</div></>
        ) : all === null ? <Loading /> : (
          <>
            <div className="h2" style={{ marginTop: 16 }}>Favourites</div>
            <div className="card" style={{ padding: "4px 14px" }}>{favs.length ? favs.map(row) : <div className="empty">Tap the star next to a player you play often.</div>}</div>
            <div className="h2">Everyone</div>
            <div className="card" style={{ padding: "4px 14px" }}>{all.length ? all.map(row) : <div className="empty">No other players yet. Invite your friends!</div>}</div>
          </>
        )}
      </main>
      <BottomNav pending={pending} />
    </>
  );
}

export function ProfileSections({ u, courts, racquets, record, private: priv }: {
  u: PublicUser; courts: CourtRef[]; racquets: Racquet[]; record?: PlayerProfile["record"];
  private?: { gender: string | null; dob: string | null; height: string; whatsapp: string | null; email: string };
}) {
  const home = courts.find((c) => c.role === "home");
  const sec = courts.filter((c) => c.role === "secondary");
  const cLine = (c?: CourtRef) => c ? <>{c.name} {c.status === "pending" && <span className="pill pend">Pending approval</span>}</> : "—";
  return (
    <>
      <div className="prohead">
        <Avatar u={u} size={96} />
        <div className="nm">{fullName(u)}</div>
        <div className="idtag">{u.pid}</div>
        <div className="small" style={{ marginTop: 6 }}>{[u.nationality, u.hand && `${u.hand}-handed`, u.backhand && `${u.backhand} backhand`].filter(Boolean).join(" · ")}</div>
      </div>
      {record && (
        <>
          <div className="stats"><div><b>{record.played}</b><span>Played</span></div><div><b style={{ color: "var(--ok)" }}>{record.won}</b><span>Won</span></div><div><b>{record.lost}</b><span>Lost</span></div></div>
          {record.form.length > 0 && <div style={{ textAlign: "center", marginTop: 10 }} className="small">Recent form<div className="form">{record.form.map((x, i) => <i key={i} className={x === "W" ? "w" : "l"}>{x}</i>)}</div></div>}
        </>
      )}
      <div className="profgrid">
      <div>
      <div className="h2">Courts</div>
      <div className="card"><dl className="kv"><dt>Home court</dt><dd>{cLine(home)}</dd>{sec.map((c, i) => <Fragment key={c.id}><dt>Secondary {i + 1}</dt><dd>{cLine(c)}</dd></Fragment>)}</dl></div>
      </div>
      <div>
      <div className="h2">Racquets</div>
      <div className="card"><dl className="kv">{racquets.length ? racquets.map((r, i) => <Fragment key={i}><dt>{r.primary ? "Primary" : "Secondary"}</dt><dd>{r.brand} {r.model}</dd></Fragment>) : <dd>—</dd>}</dl></div>
      </div>
      <div className="span-all">
      <div className="h2">Game</div>
      <div className="card"><dl className="kv">
        <dt>Plays</dt><dd>{u.hand ? `${u.hand}-handed` : "—"}</dd>
        <dt>Backhand</dt><dd>{u.backhand ?? "—"}</dd>
        <dt>Favourite shot</dt><dd>{u.shot ?? "—"}</dd>
        {priv && <>
          <dt>Gender</dt><dd>{priv.gender}</dd>
          <dt>Date of birth</dt><dd>{priv.dob ? new Date(priv.dob + "T12:00:00").toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }) : "—"} <span className="small">(you & admins)</span></dd>
          <dt>Height</dt><dd>{priv.height} <span className="small">(only you)</span></dd>
          <dt>WhatsApp</dt><dd>{priv.whatsapp || "—"} <span className="small">(admins only)</span></dd>
          <dt>Email</dt><dd style={{ wordBreak: "break-all" }}>{priv.email}</dd>
        </>}
      </dl></div>
      </div>
      </div>
    </>
  );
}

export function Player() {
  const { id } = useParams(); const { me, refresh } = useSession(); const nav = useNavigate(); const pending = usePendingCount();
  const [p, setP] = useState<PlayerProfile | null>(null); const [err, setErr] = useState("");
  const load = () => api.get<PlayerProfile>(`/players/${id}`).then(setP).catch((e) => setErr(e.message));
  useEffect(() => { if (id === me?.id) nav("/me", { replace: true }); else load(); }, [id]);
  if (err) return <><TopBar title="Player" back="/players" /><main><ErrorText msg={err} /></main></>;
  if (!p || !me) return <Loading />;
  const toggle = async () => { if (p.isFavourite) await api.del(`/favourites/${p.id}`); else await api.put(`/favourites/${p.id}`); load(); refresh(); };
  return (
    <>
      <TopBar title={p.first} back={() => nav(-1)} />
      <main className="wide">
       <div className="cols">
       <section>
        <div style={{ textAlign: "right" }}><button className={"btn sm" + (p.isFavourite ? "" : " ghost")} onClick={toggle}><Star size={16} weight={p.isFavourite ? "fill" : "regular"} /> {p.isFavourite ? "Favourite" : "Add to favourites"}</button></div>
        <ProfileSections u={p} courts={p.courts} racquets={p.racquets} record={p.record} />
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
        {p.h2h.matches.map((m) => <MatchCard key={m.id} m={m} />)}
       </section>
       </div>
      </main>
      <BottomNav pending={pending} />
    </>
  );
}
