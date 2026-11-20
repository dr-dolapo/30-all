import { Fragment, useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { api, type CourtRef, type PlayerProfile, type PublicUser, type Racquet } from "../api";
import { Avatar, BottomNav, ErrorText, fullName, Loading, RecordBlock, ScoreCard, TopBar, useSession } from "../ui";
import { usePendingCount } from "./Matches";
import { Lock, Star } from "../icons";

export function Players() {
  const { me, refresh } = useSession(); const pending = usePendingCount();
  const [popped, setPopped] = useState<string | null>(null);
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
    if (!me.favourites.includes(id)) setPopped(id);
    if (me.favourites.includes(id)) await api.del(`/favourites/${id}`); else await api.put(`/favourites/${id}`);
    refresh();
  };
  const row = (u: PublicUser) => (
    <div className="pl" key={u.id}>
      <Avatar u={u} size={42} />
      <Link to={`/players/${u.id}`} className="grow" style={{ textDecoration: "none" }}><div className="nm">{fullName(u)}</div><div className="id">{u.pid}{u.homeCourt ? ` · ${u.homeCourt}` : ""}</div></Link>
      <button className={"star" + (me.favourites.includes(u.id) ? " on" : "")} data-pop={popped === u.id && me.favourites.includes(u.id) ? "" : undefined} aria-label={me.favourites.includes(u.id) ? "Remove from favourites" : "Add to favourites"} onClick={() => toggle(u.id)}><Star size={22} weight={me.favourites.includes(u.id) ? "fill" : "regular"} /></button>
    </div>
  );
  const favs = (all ?? []).filter((u) => me.favourites.includes(u.id));
  const others = (all ?? []).filter((u) => !me.favourites.includes(u.id));
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
            <div className="h2">{favs.length ? "Other players" : "Everyone"}</div>
            <div className="card" style={{ padding: "4px 14px" }}>{others.length ? others.map(row) : <div className="empty">{all.length ? "Everyone you know is in your favourites." : "No other players yet. Invite your friends!"}</div>}</div>
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
        <div className="small" style={{ marginTop: 6 }}>{u.nationality}</div>
      </div>
      {record && (
        <>
          <RecordBlock record={record} />
        </>
      )}
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
        {p.h2h.matches.map((m) => <ScoreCard key={m.id} m={m} showDate />)}
       </section>
       </div>
      </main>
      <BottomNav pending={pending} />
    </>
  );
}
