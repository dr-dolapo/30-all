import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { STATES } from "../../shared/data";
import { ageOn } from "../../shared/rules";
import { api } from "../api";
import { Avatar, ErrorText, fullName, Loading, TopBar, useSession, useUi } from "../ui";

type Tab = "courts" | "users" | "photos";

export function Admin() {
  const { me } = useSession(); const nav = useNavigate();
  const [tab, setTab] = useState<Tab>("courts");
  if (!me) return <Loading />;
  if (!me.isAdmin) return <><TopBar title="Admin" back="/me" /><main><div className="empty">Admins only.</div></main></>;
  return (
    <>
      <TopBar title="Admin" dark right={<button className="btn sm" onClick={() => nav("/me")}>Exit</button>} />
      <main>
        <div className="tabs">
          {(["courts", "users", "photos"] as Tab[]).map((t) => <button key={t} className={"chip" + (tab === t ? " on" : "")} onClick={() => setTab(t)}>{t[0].toUpperCase() + t.slice(1)}</button>)}
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

interface AdminUser { id: string; pid: string; first: string; last: string; email: string; whatsapp: string | null; gender: string | null; dob: string | null; status: string; isAdmin: boolean; avatar: number; photoUrl: string | null }

function Users() {
  const { toast, confirm } = useUi(); const { me } = useSession();
  const [list, setList] = useState<AdminUser[] | null>(null); const [q, setQ] = useState("");
  const load = () => api.get<AdminUser[]>("/admin/users").then(setList);
  useEffect(() => { load(); }, []);
  if (!list) return <Loading />;
  const patch = async (u: AdminUser, body: object, msg: string) => { try { await api.patch(`/admin/users/${u.id}`, body); toast(msg); load(); } catch (e: any) { toast(e.message); load(); } };
  const shown = list.filter((u) => !q || `${u.first} ${u.last} ${u.pid} ${u.email}`.toLowerCase().includes(q.toLowerCase()));
  return (
    <>
      <input className="inp" placeholder="Search players" value={q} onChange={(e) => setQ(e.target.value)} />
      <div className="h2" style={{ marginTop: 14 }}>Players ({shown.length})</div>
      {shown.map((u) => (
        <div className="card" key={u.id}>
          <div className="pl" style={{ paddingTop: 0 }}>
            <Avatar u={u} size={40} />
            <div className="grow"><div className="nm">{fullName(u)} {u.status === "suspended" && <span className="pill bad">Suspended</span>} {u.status === "onboarding" && <span className="pill pend">Signing up</span>} {u.isAdmin && <span className="pill o">Admin</span>}</div><div className="id">{u.pid} · {u.email}</div></div>
          </div>
          <dl className="kv" style={{ fontSize: 13 }}>
            <dt>WhatsApp</dt><dd>{u.whatsapp || "—"}</dd>
            <dt>Gender</dt><dd>{u.gender || "—"}</dd>
            <dt>Date of birth</dt><dd><input type="date" className="inp" style={{ padding: "5px 8px" }} defaultValue={u.dob ?? ""} onBlur={(e) => e.target.value && e.target.value !== u.dob && patch(u, { dob: e.target.value }, `Date of birth updated for ${u.first}.`)} /></dd>
            <dt>Age</dt><dd>{u.dob ? ageOn(u.dob, new Date()) : "—"}</dd>
          </dl>
          {u.id !== me?.id && (
            <div className="acts">
              {u.status !== "onboarding" && <button className="btn sm ghost" onClick={() => patch(u, { status: u.status === "suspended" ? "active" : "suspended" }, `${u.first} is now ${u.status === "suspended" ? "active" : "suspended"}.`)}>{u.status === "suspended" ? "Unsuspend" : "Suspend"}</button>}
              <button className="btn sm ghost" onClick={() => patch(u, { isAdmin: !u.isAdmin }, u.isAdmin ? `${u.first} is no longer an admin.` : `${u.first} is now an admin.`)}>{u.isAdmin ? "Remove admin" : "Make admin"}</button>
              <button className="btn sm bad" onClick={() => confirm({ title: `Delete ${fullName(u)}?`, body: "Their login and personal details are removed. Their name stays on past confirmed matches so opponents' records stay right. Their pending scores are closed.", ok: "Delete", danger: true, onOk: async () => { try { await api.del(`/admin/users/${u.id}`); toast("Player deleted."); load(); } catch (e: any) { toast(e.message); } } })}>Delete</button>
            </div>
          )}
        </div>
      ))}
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
      <div style={{ display: "grid", gridTemplateColumns: "repeat(2,1fr)", gap: 10 }}>
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
