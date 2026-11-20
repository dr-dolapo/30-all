import { Fragment, useEffect, useState } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import { STATES } from "../../shared/data";
import { api, type CourtRef, type Racquet } from "../api";
import { Eye, EyeSlash } from "../icons";
import { Avatar, ErrorText, RecordBlock, fullName, Loading, TopBar, useSession, useUi } from "../ui";

type Tab = "courts" | "users" | "photos";

export function Admin() {
  const { me } = useSession(); const nav = useNavigate();
  const [params, setParams] = useSearchParams();
  const tab = (["courts", "users", "photos"].includes(params.get("tab") ?? "") ? params.get("tab") : "courts") as Tab;
  const setTab = (t: Tab) => setParams({ tab: t }, { replace: true });
  if (!me) return <Loading />;
  if (!me.isAdmin) return <><TopBar title="Admin" back="/me" /><main><div className="empty">Admins only.</div></main></>;
  return (
    <>
      <TopBar title="Admin" dark right={<button className="btn sm" onClick={() => nav("/me")}>Exit</button>} />
      <main className="wide">
        <div className="seg admin-seg" role="tablist" aria-label="Admin sections">
          {(["courts", "users", "photos"] as Tab[]).map((t) => <button key={t} role="tab" aria-selected={tab === t} className={tab === t ? "on" : ""} onClick={() => setTab(t)}>{t[0].toUpperCase() + t.slice(1)}</button>)}
        </div>
        {tab === "courts" && <Courts />}
        {tab === "users" && <Users />}
        {tab === "photos" && <Photos />}
      </main>
    </>
  );
}

interface AdminCourt { id: string; name: string; state: string; area: string | null; address: string | null; status: string; submitter: string | null; players: number }

function Courts() {
  const { toast, confirm } = useUi();
  const [list, setList] = useState<AdminCourt[] | null>(null);
  const [merge, setMerge] = useState<Record<string, string>>({});
  const [edit, setEdit] = useState<AdminCourt | null>(null);
  const [add, setAdd] = useState({ name: "", state: "Lagos", area: "", address: "" }); const [err, setErr] = useState("");
  const load = () => api.get<AdminCourt[]>("/admin/courts").then(setList);
  useEffect(() => { load(); }, []);
  if (!list) return <Loading />;
  const pending = list.filter((c) => c.status === "pending"), approved = list.filter((c) => c.status === "approved");
  const act = async (c: AdminCourt, action: "approve" | "reject" | "merge") => {
    try {
      if (action === "merge") { if (!merge[c.id]) return toast("Choose the court to merge into."); await api.post(`/admin/courts/${c.id}/merge`, { into: merge[c.id] }); }
      else await api.post(`/admin/courts/${c.id}/${action}`);
      toast(action === "approve" ? "Court approved. The player was notified." : action === "reject" ? "Court rejected. Affected players were notified." : "Courts merged. Affected players were notified.");
      load();
    } catch (e: any) { toast(e.message); }
  };
  const saveEdit = async () => { if (!edit) return; try { await api.put(`/admin/courts/${edit.id}`, edit); setEdit(null); load(); } catch (e: any) { toast(e.message); } };
  const addCourt = async () => { setErr(""); try { await api.post("/admin/courts", add); setAdd({ ...add, name: "", area: "", address: "" }); toast("Court added."); load(); } catch (e: any) { setErr(e.message); } };

  return (
    <>
      <div className="h2">Waiting for review ({pending.length})</div>
      {pending.length === 0 && <div className="empty">No courts waiting for review.</div>}
      <div className="cardgrid">
      {pending.map((c) => (
        <div className="card" key={c.id}>
          {edit?.id === c.id ? (
            <>
              <label className="f" style={{ marginTop: 0 }}>Name</label><input className="inp" value={edit.name} onChange={(e) => setEdit({ ...edit, name: e.target.value })} />
              <label className="f">Area</label><input className="inp" value={edit.area ?? ""} onChange={(e) => setEdit({ ...edit, area: e.target.value })} />
              <label className="f">Address</label><input className="inp" value={edit.address ?? ""} onChange={(e) => setEdit({ ...edit, address: e.target.value })} />
              <div className="acts"><button className="btn sm ghost" onClick={() => setEdit(null)}>Cancel</button><button className="btn sm dark" onClick={saveEdit}>Save</button></div>
            </>
          ) : (
            <>
              <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}><div style={{ fontWeight: 700 }}>{c.name}</div><button className="link small" onClick={() => setEdit(c)}>Edit</button></div>
              <div className="small">{[c.address || c.area || "No address given", c.state].join(" · ")}</div>
              <div className="small" style={{ marginTop: 4 }}>{c.submitter ? `Submitted by ${c.submitter}` : "From the starter list"} · on {c.players} profile{c.players === 1 ? "" : "s"}</div>
              <div className="acts">
                <button className="btn sm bad" onClick={() => confirm({ title: `Reject ${c.name}?`, body: "It will be removed from any profiles using it, and those players will be told.", ok: "Reject", danger: true, onOk: () => act(c, "reject") })}>Reject</button>
                <button className="btn sm ok" onClick={() => act(c, "approve")}>Approve</button>
              </div>
              <div className="row" style={{ marginTop: 8 }}>
                <select className="inp" value={merge[c.id] ?? ""} onChange={(e) => setMerge({ ...merge, [c.id]: e.target.value })}>
                  <option value="">Same as an existing court…</option>
                  {approved.filter((a) => a.state === c.state).map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
                </select>
                <button className="btn sm dark" style={{ flex: "0 0 auto" }} onClick={() => act(c, "merge")}>Merge</button>
              </div>
            </>
          )}
        </div>
      ))}
      </div>
      <div className="h2">Add an approved court</div>
      <div className="card">
        <div className="row"><input className="inp" placeholder="Court name" value={add.name} onChange={(e) => setAdd({ ...add, name: e.target.value })} />
          <select className="inp" style={{ flex: "0 0 120px" }} value={add.state} onChange={(e) => setAdd({ ...add, state: e.target.value })}>{STATES.map((s) => <option key={s}>{s}</option>)}</select></div>
        <div className="row" style={{ marginTop: 8 }}><input className="inp" placeholder="Area" value={add.area} onChange={(e) => setAdd({ ...add, area: e.target.value })} /><input className="inp" placeholder="Address" value={add.address} onChange={(e) => setAdd({ ...add, address: e.target.value })} /></div>
        <ErrorText msg={err} />
        <div style={{ marginTop: 8 }}><button className="btn sm dark" onClick={addCourt}>Add court</button></div>
      </div>
      <div className="h2">Approved courts ({approved.length})</div>
      <div className="card" style={{ padding: "4px 14px" }}>
        {approved.map((c) => <div className="pl" key={c.id}><div className="grow"><div className="nm">{c.name}</div><div className="id">{[c.area, c.state].filter(Boolean).join(" · ")} · {c.players} player{c.players === 1 ? "" : "s"}</div></div></div>)}
      </div>
    </>
  );
}

interface AdminUser {
  id: string; pid: string; first: string; last: string; email: string; whatsapp: string | null; gender: string | null;
  status: string; isAdmin: boolean; avatar: number; photoUrl: string | null;
  homeCourtId: string | null; homeCourtName: string | null; homeCourtStatus: string | null;
}

/** Approved courts for the home-court dropdowns, grouped by state. */
function useApprovedCourts() {
  const [courts, setCourts] = useState<AdminCourt[]>([]);
  useEffect(() => { api.get<AdminCourt[]>("/admin/courts").then((cs) => setCourts(cs.filter((c) => c.status === "approved"))).catch(() => {}); }, []);
  return courts;
}

/** Dropdown that changes a player's home court after a confirmation. */
export function HomeCourtSelect({ user, courts, onChanged }: {
  user: { id: string; first: string; homeCourtId: string | null; homeCourtName: string | null; homeCourtStatus: string | null };
  courts: AdminCourt[]; onChanged: () => void;
}) {
  const { toast, confirm } = useUi();
  const states = [...new Set(courts.map((c) => c.state))];
  const change = (courtId: string) => {
    const ct = courts.find((c) => c.id === courtId);
    if (!ct) return;
    confirm({
      title: `Change ${user.first}'s home court?`,
      body: <>From <b>{user.homeCourtName ?? "none"}</b> to <b>{ct.name}</b>. {user.first} will be notified.</>,
      ok: "Change home court",
      onOk: async () => { try { await api.put(`/admin/users/${user.id}/home-court`, { courtId }); toast(`${user.first}'s home court is now ${ct.name}.`); } catch (e: any) { toast(e.message); } onChanged(); },
    });
  };
  return (
    <select className="inp" style={{ padding: "5px 8px" }} aria-label={`Home court for ${user.first}`} value={user.homeCourtStatus === "approved" ? user.homeCourtId ?? "" : ""}
      onChange={(e) => e.target.value && change(e.target.value)}>
      <option value="">{user.homeCourtId ? (user.homeCourtStatus === "approved" ? "—" : `${user.homeCourtName} (pending)`) : "None yet"}</option>
      {states.map((st) => <optgroup key={st} label={st}>{courts.filter((c) => c.state === st).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</optgroup>)}
    </select>
  );
}

export function StatusPills({ u }: { u: { status: string; isAdmin: boolean } }) {
  return <>{u.status === "suspended" && <span className="pill bad">Suspended</span>} {u.status === "onboarding" && <span className="pill pend">Signing up</span>} {u.isAdmin && <span className="pill o">Admin</span>}</>;
}

function Users() {
  const nav = useNavigate();
  const [list, setList] = useState<AdminUser[] | null>(null); const [q, setQ] = useState("");
  const courts = useApprovedCourts();
  const load = () => api.get<AdminUser[]>("/admin/users").then(setList);
  useEffect(() => { load(); }, []);
  if (!list) return <Loading />;
  const shown = list.filter((u) => !q || `${u.first} ${u.last} ${u.pid} ${u.email}`.toLowerCase().includes(q.toLowerCase()));
  return (
    <>
      <input className="inp" placeholder="Search players" value={q} onChange={(e) => setQ(e.target.value)} />
      <div className="h2" style={{ marginTop: 14 }}>Players ({shown.length})</div>
      <div className="cardgrid">
      {shown.map((u) => (
        <div className="card" key={u.id}>
          <div className="pl" style={{ paddingTop: 0 }}>
            <Avatar u={u} size={40} />
            <div className="grow"><div className="nm">{fullName(u)} <StatusPills u={u} /></div><div className="id">{u.pid} · {u.email}</div></div>
            <button className="btn sm ghost" style={{ flex: "none" }} onClick={() => nav(`/admin/users/${u.id}`)}>Edit</button>
          </div>
          <dl className="kv" style={{ fontSize: 13 }}>
            <dt>WhatsApp</dt><dd>{u.whatsapp || "—"}</dd>
            <dt>Gender</dt><dd>{u.gender || "—"}</dd>
            <dt>Home court</dt><dd><HomeCourtSelect user={u} courts={courts} onChanged={load} /></dd>
          </dl>
        </div>
      ))}
      </div>
    </>
  );
}

/* ---------- full player page for admins ---------- */

interface AdminUserDetail {
  id: string; pid: string; first: string; last: string; email: string; status: string; isAdmin: boolean;
  gender: string | null; nationality: string | null; whatsapp: string | null; heightCm: number | null; heightUnit: string;
  hand: string | null; backhand: string | null; shot: string | null; avatar: number; photoUrl: string | null; createdAt: number;
  courts: CourtRef[]; racquets: Racquet[]; record: { played: number; won: number; lost: number; form: string[] };
}

const EyeIcon = ({ open }: { open: boolean }) => (open ? <EyeSlash size={18} weight="bold" aria-hidden="true" /> : <Eye size={18} weight="bold" aria-hidden="true" />);

/** Shows **** until the admin clicks the eye. */
function Masked({ value, shown, onToggle, label }: { value: React.ReactNode; shown: boolean; onToggle: () => void; label: string }) {
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
      <span style={{ fontVariantNumeric: "tabular-nums", letterSpacing: shown ? 0 : ".1em" }}>{shown ? value : "****"}</span>
      <button type="button" className="eye" aria-label={shown ? `Hide ${label}` : `Show ${label}`} aria-pressed={shown} onClick={onToggle}><EyeIcon open={shown} /></button>
    </span>
  );
}

export function AdminUserPage() {
  const { id } = useParams(); const nav = useNavigate(); const { me } = useSession(); const { toast, confirm } = useUi();
  const [u, setU] = useState<AdminUserDetail | null>(null); const [err, setErr] = useState("");
  const [dob, setDob] = useState<{ dob: string | null; age: number | null } | null>(null);
  const [show, setShow] = useState({ dob: false, age: false });
  const [editDob, setEditDob] = useState<string | null>(null);
  const courts = useApprovedCourts();
  const load = () => api.get<AdminUserDetail>(`/admin/users/${id}`).then(setU).catch((e) => setErr(e.message));
  useEffect(() => { load(); }, [id]);
  const back = () => nav("/admin?tab=users");

  if (!me?.isAdmin) return <><TopBar title="Admin" back="/me" /><main><div className="empty">Admins only.</div></main></>;
  if (err) return <><TopBar title="Player" back={back} dark /><main><ErrorText msg={err} /></main></>;
  if (!u) return <Loading />;

  const reveal = async (field: "dob" | "age") => {
    if (show[field]) { setShow({ ...show, [field]: false }); return; }
    if (!dob) { try { setDob(await api.get(`/admin/users/${u.id}/dob`)); } catch (e: any) { toast(e.message); return; } }
    setShow({ ...show, [field]: true });
  };
  const saveDob = async () => {
    if (!editDob) return;
    try { await api.patch(`/admin/users/${u.id}`, { dob: editDob }); setDob(await api.get(`/admin/users/${u.id}/dob`)); setEditDob(null); toast(`Date of birth updated for ${u.first}.`); }
    catch (e: any) { toast(e.message); }
  };
  const patch = async (body: object, msg: string) => { try { await api.patch(`/admin/users/${u.id}`, body); toast(msg); load(); } catch (e: any) { toast(e.message); } };
  const home = u.courts.find((c) => c.role === "home");
  const sec = u.courts.filter((c) => c.role === "secondary");
  const height = u.heightCm ? (u.heightUnit === "imperial" ? `${Math.floor(Math.round(u.heightCm / 2.54) / 12)}′${Math.round(u.heightCm / 2.54) % 12}″ (${u.heightCm} cm)` : `${u.heightCm} cm`) : "—";
  const fmt = (iso: string) => new Date(iso + "T12:00:00").toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" });
  const isMe = u.id === me.id;

  return (
    <>
      <TopBar title={fullName(u)} back={back} dark />
      <main>
        <div className="prohead">
          <Avatar u={u} size={96} />
          <div className="nm">{fullName(u)}</div>
          <div className="idtag">{u.pid}</div>
          <div style={{ marginTop: 8 }}><StatusPills u={u} /></div>
        </div>
        <RecordBlock record={u.record} />

        <div className="profgrid">
          <div className="span-all">
            <div className="h2">Personal details</div>
            <div className="card"><dl className="kv">
              <dt>Email</dt><dd style={{ wordBreak: "break-all" }}>{u.email}</dd>
              <dt>WhatsApp</dt><dd>{u.whatsapp || "—"}</dd>
              <dt>Gender</dt><dd>{u.gender || "—"}</dd>
              <dt>Nationality</dt><dd>{u.nationality || "—"}</dd>
              <dt>Date of birth</dt>
              <dd>
                {editDob !== null ? (
                  <span className="row" style={{ gap: 6 }}>
                    <input type="date" className="inp" style={{ padding: "5px 8px" }} value={editDob} onChange={(e) => setEditDob(e.target.value)} />
                    <button className="btn sm dark" style={{ flex: "0 0 auto" }} onClick={saveDob}>Save</button>
                    <button className="btn sm ghost" style={{ flex: "0 0 auto" }} onClick={() => setEditDob(null)}>Cancel</button>
                  </span>
                ) : (
                  <>
                    <Masked label="date of birth" shown={show.dob} onToggle={() => reveal("dob")} value={dob?.dob ? fmt(dob.dob) : "—"} />
                    {show.dob && <button className="link small" style={{ marginLeft: 10 }} onClick={() => setEditDob(dob?.dob ?? "")}>Change</button>}
                  </>
                )}
              </dd>
              <dt>Age</dt><dd><Masked label="age" shown={show.age} onToggle={() => reveal("age")} value={dob?.age ?? "—"} /></dd>
              <dt>Height</dt><dd>{height}</dd>
              <dt>Joined</dt><dd>{new Date(u.createdAt).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}</dd>
            </dl></div>
          </div>
          <div>
            <div className="h2">Courts</div>
            <div className="card"><dl className="kv">
              <dt>Home court</dt>
              <dd><HomeCourtSelect user={{ id: u.id, first: u.first, homeCourtId: home?.id ?? null, homeCourtName: home?.name ?? null, homeCourtStatus: home?.status ?? null }} courts={courts} onChanged={load} /></dd>
              {sec.map((c, i) => <Fragment key={c.id}><dt>Secondary {i + 1}</dt><dd>{c.name} {c.status === "pending" && <span className="pill pend">Pending</span>}</dd></Fragment>)}
            </dl></div>
          </div>
          <div>
            <div className="h2">Racquets</div>
            <div className="card"><dl className="kv">
              {u.racquets.length ? u.racquets.map((r, i) => <Fragment key={i}><dt>{r.primary ? "Primary" : "Secondary"}</dt><dd>{r.brand} {r.model}{r.custom && <span className="small"> (typed in)</span>}</dd></Fragment>) : <dd>—</dd>}
            </dl></div>
          </div>
          <div className="span-all">
            <div className="h2">Game</div>
            <div className="card"><dl className="kv">
              <dt>Plays</dt><dd>{u.hand ? `${u.hand}-handed` : "—"}</dd>
              <dt>Backhand</dt><dd>{u.backhand ?? "—"}</dd>
              <dt>Favourite shot</dt><dd>{u.shot ?? "—"}</dd>
            </dl></div>
          </div>
        </div>

        <div className="h2">Account</div>
        <div className="card">
          {isMe ? <p className="small">This is your own account. Another admin would need to change your access, suspend or delete it.</p> : (
            <div style={{ display: "grid", gap: 10 }}>
              <button className="btn ghost" onClick={() => patch({ isAdmin: !u.isAdmin }, u.isAdmin ? `${u.first} is no longer an admin.` : `${u.first} is now an admin.`)}>{u.isAdmin ? "Remove admin access" : "Make admin"}</button>
              {u.status !== "onboarding" && (
                <button className="btn ghost" onClick={() => u.status === "suspended"
                  ? patch({ status: "active" }, `${u.first} can log in again.`)
                  : confirm({ title: `Suspend ${u.first}?`, body: "They'll be logged out and can't log in until you unsuspend them. Their matches stay on the record.", ok: "Suspend", danger: true, onOk: () => patch({ status: "suspended" }, `${u.first} is suspended.`) })}>
                  {u.status === "suspended" ? "Unsuspend" : "Suspend"}
                </button>
              )}
              <button className="btn bad" onClick={() => confirm({ title: `Delete ${fullName(u)}?`, body: "Their login and personal details are removed. Their name stays on past confirmed matches so opponents' records stay right. Their pending scores are closed. This can't be undone.", ok: "Delete", danger: true,
                onOk: async () => { try { await api.del(`/admin/users/${u.id}`); toast("Player deleted."); back(); } catch (e: any) { toast(e.message); } } })}>Delete player</button>
            </div>
          )}
        </div>
      </main>
    </>
  );
}

function Photos() {
  const { toast, confirm } = useUi();
  const [list, setList] = useState<Array<{ id: string; pid: string; first: string; last: string; photoUrl: string }> | null>(null);
  const load = () => api.get<any[]>("/admin/photos").then(setList);
  useEffect(() => { load(); }, []);
  if (!list) return <Loading />;
  return (
    <>
      <div className="h2">Uploaded profile photos</div>
      <p className="small" style={{ marginBottom: 10 }}>Removing a photo switches the player back to an avatar and tells them why.</p>
      {list.length === 0 && <div className="empty">No uploaded photos.</div>}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(170px,1fr))", gap: 10 }}>
        {list.map((u) => (
          <div className="card" key={u.id} style={{ textAlign: "center", margin: 0 }}>
            <Avatar u={{ avatar: 0, photoUrl: u.photoUrl }} size={90} />
            <div className="nm" style={{ margin: "6px 0" }}>{u.first} {u.last}</div>
            <button className="btn sm bad" onClick={() => confirm({ title: "Remove this photo?", body: `${u.first} will be told it didn't meet the guidelines.`, ok: "Remove", danger: true, onOk: async () => { await api.del(`/admin/users/${u.id}/photo`); toast("Photo removed. The player was notified."); load(); } })}>Remove photo</button>
          </div>
        ))}
      </div>
    </>
  );
}
