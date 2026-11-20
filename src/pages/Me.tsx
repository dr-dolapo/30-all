import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { api, type Notification } from "../api";
import { AboutFields, AvatarPicker, CourtPicker, draftFromMe, heightCm, profileBody, RacquetEditor, StyleFields, type Draft } from "../forms";
import { ago, BottomNav, ErrorText, Loading, TopBar, useSession, useUi } from "../ui";
import { usePendingCount } from "./Matches";
import { Buildings, CheckCircle, Clock, HandWaving, ImageIcon, TennisBall, XCircle } from "../icons";

/** Icon and colour for a notification, from what it says. */
function kindOf(text: string) {
  const t = text.toLowerCase();
  if (t.includes("automatically rejected") || t.includes("expired")) return { icon: <Clock size={18} weight="fill" />, tone: "warn" };
  if (t.includes("rejected") || t.includes("wasn't approved") || t.includes("deleted")) return { icon: <XCircle size={18} weight="fill" />, tone: "bad" };
  if (t.includes("photo")) return { icon: <ImageIcon size={18} weight="fill" />, tone: "bad" };
  if (t.includes("court")) return { icon: <Buildings size={18} weight="fill" />, tone: "info" };
  if (t.includes("accepted")) return { icon: <CheckCircle size={18} weight="fill" />, tone: "ok" };
  if (t.includes("welcome")) return { icon: <HandWaving size={18} weight="fill" />, tone: "info" };
  return { icon: <TennisBall size={18} weight="fill" />, tone: "o" };
}

/** Renders **marked** details in bold. Text is split, never parsed as HTML. */
const richText = (text: string) => text.split("**").map((part, i) => (i % 2 ? <b key={i}>{part}</b> : part));

/** Groups notifications under Today, Yesterday and Earlier. */
function groupByDay<T extends { at: number }>(list: T[]): Array<[string, T[]]> {
  const day = (t: number) => new Date(t + 3600_000).toISOString().slice(0, 10); // Lagos date
  const today = day(Date.now()), yest = day(Date.now() - 864e5);
  const groups: Record<string, T[]> = {};
  for (const n of list) { const d = day(n.at); const k = d === today ? "Today" : d === yest ? "Yesterday" : "Earlier"; (groups[k] ??= []).push(n); }
  return (["Today", "Yesterday", "Earlier"] as const).filter((k) => groups[k]).map((k) => [k, groups[k]]);
}
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
          <>{groupByDay(list).map(([label, items]) => (
            <section key={label}>
              <div className="h2">{label}</div>
              <div className="card" style={{ padding: "0 14px" }}>
                {items.map((n) => {
                  const k = kindOf(n.text.replace(/\*\*/g, ""));
                  return (
                    <div key={n.id} className={"notif" + (n.readAt ? "" : " unread")} style={n.matchId ? { cursor: "pointer" } : undefined} onClick={() => n.matchId && nav("/matches")}>
                      <span className={"nicon " + k.tone} aria-hidden="true">{k.icon}</span>
                      <div className="nbody"><div className="t">{richText(n.text)}</div><div className="tm">{ago(n.at)}</div></div>
                      {!n.readAt && <span className="dotu" aria-label="Unread" />}
                    </div>
                  );
                })}
              </div>
            </section>
          ))}</>
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
      <main className="narrow">
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
