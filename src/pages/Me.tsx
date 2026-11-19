import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { api, type Notification } from "../api";
import { AboutFields, AvatarPicker, CourtPicker, draftFromMe, heightCm, profileBody, RacquetEditor, StyleFields, type Draft } from "../forms";
import { ago, BottomNav, ErrorText, Loading, TopBar, useSession, useUi } from "../ui";
import { usePendingCount } from "./Matches";
import { ProfileSections } from "./Players";

export function Inbox() {
  const { refresh } = useSession(); const pending = usePendingCount(); const nav = useNavigate();
  const [list, setList] = useState<Notification[] | null>(null);
  useEffect(() => {
    api.get<Notification[]>("/notifications").then((l) => { setList(l); if (l.some((n) => !n.readAt)) api.post("/notifications/read").then(refresh); }).catch(() => setList([]));
  }, []);
  return (
    <>
      <TopBar title="Inbox" />
      <main>
        {list === null ? <Loading /> : list.length === 0 ? <div className="empty">Nothing here yet.</div> : (
          <div className="card" style={{ padding: "0 14px" }}>
            {list.map((n) => (
              <div key={n.id} className={"notif" + (n.readAt ? "" : " unread")} style={n.matchId ? { cursor: "pointer" } : undefined} onClick={() => n.matchId && nav("/matches")}>
                <span className={n.readAt ? "dotr" : "dotu"} />
                <div><div className="t">{n.text}</div><div className="tm">{ago(n.at)}</div></div>
              </div>
            ))}
          </div>
        )}
        <p className="small" style={{ textAlign: "center" }}>Important updates are also sent to your email.</p>
      </main>
      <BottomNav pending={pending} />
    </>
  );
}

const heightText = (cm: number | null, unit: string) => {
  if (!cm) return "—";
  if (unit === "imperial") { const t = Math.round(cm / 2.54); return `${Math.floor(t / 12)}′${t % 12}″`; }
  return `${cm} cm`;
};

export function MyProfile() {
  const { me, setMe } = useSession(); const nav = useNavigate(); const pending = usePendingCount();
  const [record, setRecord] = useState<any>(null);
  useEffect(() => { if (me) api.get<any>(`/players/${me.id}`).then((p) => setRecord(p.record)).catch(() => {}); }, [me?.id]);
  if (!me) return <Loading />;
  const logout = async () => { await api.post("/auth/logout").catch(() => {}); setMe(null); nav("/"); };
  return (
    <>
      <TopBar title="My profile" right={me.isAdmin ? <Link to="/admin" className="btn sm dark" style={{ textDecoration: "none" }}>Admin</Link> : undefined} />
      <main>
        <div style={{ textAlign: "right" }}><Link to="/me/edit" className="btn sm ghost" style={{ textDecoration: "none" }}>Edit profile</Link></div>
        <ProfileSections u={me} courts={me.courts} racquets={me.racquets} record={record ?? undefined}
          private={{ gender: me.gender, dob: me.dob, height: heightText(me.heightCm, me.heightUnit), whatsapp: me.whatsapp, email: me.email }} />
        <button className="btn ghost" style={{ marginTop: 8 }} onClick={logout}>Log out</button>
      </main>
      <BottomNav pending={pending} />
    </>
  );
}

export function EditProfile() {
  const { me, refresh } = useSession(); const nav = useNavigate(); const { toast } = useUi();
  const [d, setD] = useState<Draft | null>(me ? draftFromMe(me) : null);
  const [err, setErr] = useState(""); const [busy, setBusy] = useState(false);
  if (!me || !d) return <Loading />;
  const set = (p: Partial<Draft>) => setD({ ...d, ...p });
  const save = async () => {
    setErr("");
    if (!d.first.trim() || !d.last.trim()) return setErr("Name can't be empty");
    if (!d.homeCourt) return setErr("Pick your home court");
    const h = heightCm(d); if (h !== null && (h < 120 || h > 230)) return setErr("Enter a height between 120 and 230 cm");
    if (d.racquets.some((r) => !r.brand.trim() || !r.model.trim())) return setErr("Finish each racquet or remove it");
    setBusy(true);
    try {
      const { dob: _dob, ...body } = profileBody(d); // date of birth is admin-only after sign-up
      await api.put("/me", { ...body, first: d.first, last: d.last });
      await refresh(); toast("Profile saved."); nav("/me");
    } catch (e: any) { setErr(e.message); } finally { setBusy(false); }
  };
  return (
    <>
      <TopBar title="Edit profile" back="/me" />
      <main>
        <div className="card"><AvatarPicker d={d} set={set} /></div>
        <div className="card">
          <div className="row">
            <div><label className="f" style={{ marginTop: 0 }}>First name</label><input className="inp" value={d.first} onChange={(e) => set({ first: e.target.value })} /></div>
            <div><label className="f" style={{ marginTop: 0 }}>Last name</label><input className="inp" value={d.last} onChange={(e) => set({ last: e.target.value })} /></div>
          </div>
          <div className="hint">Your player ID ({me.pid}) stays the same.</div>
          <label className="f">Email</label>
          <input className="inp" value={me.email} disabled />
          <div className="hint">Email can't be changed yet. Ask an admin if you need to.</div>
          <AboutFields d={d} set={set} dobLocked />
        </div>
        <div className="card"><StyleFields d={d} set={set} /></div>
        <div className="h2">Courts</div>
        <CourtPicker d={d} set={set} />
        <div className="h2">Racquets</div>
        <RacquetEditor d={d} set={set} />
        <ErrorText msg={err} />
        <div style={{ marginTop: 14 }}><button className="btn" onClick={save} disabled={busy}>{busy ? "Saving…" : "Save changes"}</button></div>
      </main>
    </>
  );
}
