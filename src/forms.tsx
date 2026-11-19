// Profile form pieces shared by onboarding and "Edit profile".
import { useEffect, useState } from "react";
import { AVATAR_NAMES, avatarSVG } from "../shared/avatars";
import { BACKHANDS, GENDERS, HANDS, NATIONALITIES, SHOTS, STATES, WHATSAPP_CODES } from "../shared/data";
import { api, type CourtRef, type Me, type Racquet } from "./api";
import { ErrorText, useUi } from "./ui";

export interface Draft {
  first: string; last: string;
  gender: string; dob: string; nationality: string; waCode: string; wa: string;
  heightUnit: "metric" | "imperial"; cm: string; ft: string; inch: string;
  hand: string; backhand: string; shot: string;
  state: string; homeCourt: string; secCourts: string[]; courtNames: Record<string, CourtRef>;
  racquets: Racquet[]; avatar: number; photoUrl: string | null;
}

export function draftFromMe(me: Me): Draft {
  const code = WHATSAPP_CODES.find((c) => me.whatsapp?.startsWith(c)) ?? "+234";
  const tin = me.heightCm ? Math.round(me.heightCm / 2.54) : 0;
  const home = me.courts.find((c) => c.role === "home");
  const names: Record<string, CourtRef> = {};
  me.courts.forEach((c) => (names[c.id] = c));
  return {
    first: me.first, last: me.last,
    gender: me.gender ?? "", dob: me.dob ?? "", nationality: me.nationality ?? "Nigeria",
    waCode: code, wa: me.whatsapp ? me.whatsapp.slice(code.length).trim() : "",
    heightUnit: me.heightUnit ?? "metric", cm: me.heightCm ? String(me.heightCm) : "", ft: tin ? String(Math.floor(tin / 12)) : "", inch: tin ? String(tin % 12) : "",
    hand: me.hand ?? "", backhand: me.backhand ?? "", shot: me.shot ?? "",
    state: home?.state ?? "Lagos", homeCourt: home?.id ?? "", secCourts: me.courts.filter((c) => c.role === "secondary").map((c) => c.id), courtNames: names,
    racquets: me.racquets.length ? me.racquets : [{ brand: "", model: "", custom: false, primary: true }],
    avatar: me.avatar, photoUrl: me.photoUrl,
  };
}

export function heightCm(d: Draft): number | null {
  if (d.heightUnit === "metric") return d.cm ? Math.round(Number(d.cm)) : null;
  if (!d.ft) return null;
  return Math.round((Number(d.ft) * 12 + Number(d.inch || 0)) * 2.54);
}

type Set = (patch: Partial<Draft>) => void;

function Seg({ value, options, onChange, labels }: { value: string; options: readonly string[]; onChange: (v: string) => void; labels?: string[] }) {
  return (
    <div className="seg" role="radiogroup">
      {options.map((o, i) => <button type="button" key={o} role="radio" aria-checked={value === o} className={value === o ? "on" : ""} onClick={() => onChange(o)}>{labels?.[i] ?? o}</button>)}
    </div>
  );
}

const maxDob = () => { const d = new Date(); d.setFullYear(d.getFullYear() - 18); return d.toISOString().slice(0, 10); };

export function AboutFields({ d, set, dobLocked }: { d: Draft; set: Set; dobLocked?: boolean }) {
  return (
    <>
      <label className="f">Gender <span className="req">*</span></label>
      <Seg value={d.gender} options={GENDERS} onChange={(v) => set({ gender: v })} />
      <label className="f">Date of birth <span className="req">*</span></label>
      <input className="inp" type="date" max={maxDob()} value={d.dob} disabled={dobLocked} onChange={(e) => set({ dob: e.target.value })} />
      <div className="hint">{dobLocked ? "Only an admin can change this." : "You must be 18 or older. Used later for age-group events."}</div>
      <label className="f">Nationality <span className="req">*</span></label>
      <select className="inp" value={d.nationality} onChange={(e) => set({ nationality: e.target.value })}>
        {NATIONALITIES.map((n) => <option key={n}>{n}</option>)}
      </select>
      <label className="f">WhatsApp number</label>
      <div className="row">
        <select className="inp" style={{ flex: "0 0 96px" }} value={d.waCode} onChange={(e) => set({ waCode: e.target.value })}>
          {WHATSAPP_CODES.map((c) => <option key={c}>{c}</option>)}
        </select>
        <input className="inp" inputMode="tel" placeholder="803 000 0000" value={d.wa} onChange={(e) => set({ wa: e.target.value })} />
      </div>
      <div className="hint">Only admins can see this.</div>
      <label className="f">Height</label>
      <div style={{ marginBottom: 8 }}><Seg value={d.heightUnit} options={["metric", "imperial"]} labels={["Metric (cm)", "Imperial (ft/in)"]} onChange={(v) => set({ heightUnit: v as any })} /></div>
      {d.heightUnit === "metric"
        ? <input className="inp" inputMode="numeric" placeholder="e.g. 178" value={d.cm} onChange={(e) => set({ cm: e.target.value.replace(/\D/g, "") })} />
        : <div className="row">
            <select className="inp" value={d.ft} onChange={(e) => set({ ft: e.target.value })}><option value="">ft</option>{[4, 5, 6, 7].map((f) => <option key={f}>{f}</option>)}</select>
            <select className="inp" value={d.inch} onChange={(e) => set({ inch: e.target.value })}><option value="">in</option>{Array.from({ length: 12 }, (_, i) => <option key={i}>{i}</option>)}</select>
          </div>}
      <div className="hint">Hidden from other players.</div>
    </>
  );
}

export function StyleFields({ d, set }: { d: Draft; set: Set }) {
  return (
    <>
      <label className="f">Handedness <span className="req">*</span></label>
      <Seg value={d.hand} options={HANDS} onChange={(v) => set({ hand: v })} />
      <label className="f">Backhand</label>
      <Seg value={d.backhand} options={BACKHANDS} onChange={(v) => set({ backhand: v })} />
      <label className="f">Favourite shot</label>
      <div className="chips">
        {SHOTS.map((s) => <button type="button" key={s} className={"chip" + (d.shot === s ? " on" : "")} onClick={() => set({ shot: d.shot === s ? "" : s })}>{s}</button>)}
      </div>
    </>
  );
}

export function CourtPicker({ d, set }: { d: Draft; set: Set }) {
  const { toast } = useUi();
  const [list, setList] = useState<CourtRef[] | null>(null);
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState(""); const [addr, setAddr] = useState(""); const [err, setErr] = useState("");
  useEffect(() => { setList(null); api.get<CourtRef[]>(`/ref/courts?state=${encodeURIComponent(d.state)}`).then(setList).catch(() => setList([])); }, [d.state]);

  const remember = (c: CourtRef) => ({ ...d.courtNames, [c.id]: c });
  const pick = (c: CourtRef, kind: "home" | "sec") => {
    if (kind === "home") set({ homeCourt: d.homeCourt === c.id ? "" : c.id, secCourts: d.secCourts.filter((x) => x !== c.id), courtNames: remember(c) });
    else if (d.secCourts.includes(c.id)) set({ secCourts: d.secCourts.filter((x) => x !== c.id) });
    else if (d.secCourts.length >= 2) toast("You can pick up to 2 secondary courts.");
    else set({ secCourts: [...d.secCourts, c.id], homeCourt: d.homeCourt === c.id ? "" : d.homeCourt, courtNames: remember(c) });
  };
  const submit = async () => {
    setErr("");
    try {
      const c = await api.post<CourtRef>("/courts", { name, address: addr, state: d.state });
      setList((l) => [...(l ?? []), c]);
      const patch: Partial<Draft> = { courtNames: remember(c) };
      if (!d.homeCourt) patch.homeCourt = c.id; else if (d.secCourts.length < 2) patch.secCourts = [...d.secCourts, c.id];
      set(patch); setAdding(false); setName(""); setAddr("");
      toast(`${c.name} was sent to the admins for approval.`);
    } catch (e: any) { setErr(e.message); }
  };
  const elsewhere = [d.homeCourt, ...d.secCourts].filter((id) => id && !list?.some((c) => c.id === id));

  return (
    <>
      <label className="f">Country</label>
      <select className="inp" disabled><option>Nigeria</option></select>
      <div className="hint">Only Nigeria is available for now.</div>
      <label className="f">State</label>
      <select className="inp" value={d.state} onChange={(e) => set({ state: e.target.value })}>{STATES.map((s) => <option key={s}>{s}</option>)}</select>
      {elsewhere.length > 0 && <div className="hint">Also selected: {elsewhere.map((id) => d.courtNames[id]?.name ?? "a court").join(", ")}</div>}
      <div className="card" style={{ marginTop: 12, padding: "6px 14px" }}>
        {list === null ? <div className="empty">Loading courts…</div> : list.length === 0 ? <div className="empty">No approved courts in {d.state} yet. Add yours below.</div> :
          list.map((c) => (
            <div className="pl" key={c.id}>
              <div className="grow"><div className="nm">{c.name} {c.status === "pending" && <span className="pill pend">Pending</span>}</div><div className="id">{c.area}</div></div>
              <button type="button" className={"chip" + (d.homeCourt === c.id ? " on" : "")} onClick={() => pick(c, "home")}>Home</button>
              <button type="button" className={"chip" + (d.secCourts.includes(c.id) ? " on" : "")} onClick={() => pick(c, "sec")}>2nd</button>
            </div>
          ))}
      </div>
      <div className="card">
        {!adding ? <button type="button" className="link" onClick={() => setAdding(true)}>Can't find your court? Add it</button> : (
          <>
            <div style={{ fontWeight: 600 }}>Add a court in {d.state}</div>
            <p className="hint">The admins will review it. It shows as <b>Pending</b> on your profile until it's approved.</p>
            <label className="f">Court name</label><input className="inp" value={name} onChange={(e) => setName(e.target.value)} />
            <label className="f">Approximate address</label><input className="inp" value={addr} onChange={(e) => setAddr(e.target.value)} />
            <ErrorText msg={err} />
            <div className="row" style={{ marginTop: 10 }}>
              <button type="button" className="btn sm ghost" onClick={() => setAdding(false)}>Cancel</button>
              <button type="button" className="btn sm dark" onClick={submit}>Submit court</button>
            </div>
          </>
        )}
      </div>
    </>
  );
}

export function RacquetEditor({ d, set }: { d: Draft; set: Set }) {
  const [models, setModels] = useState<Record<string, string[]>>({});
  useEffect(() => { api.get<Record<string, string[]>>("/ref/racquets").then(setModels).catch(() => {}); }, []);
  const upd = (i: number, patch: Partial<Racquet>) => set({ racquets: d.racquets.map((r, k) => (k === i ? { ...r, ...patch } : r)) });
  const remove = (i: number) => {
    const rs = d.racquets.filter((_, k) => k !== i);
    if (!rs.some((r) => r.primary) && rs[0]) rs[0] = { ...rs[0], primary: true };
    set({ racquets: rs });
  };
  return (
    <>
      {d.racquets.map((r, i) => (
        <div className="rq" key={i}>
          <div className="rqtop">
            <label className="radio"><input type="radio" name="primary" checked={r.primary} onChange={() => set({ racquets: d.racquets.map((x, k) => ({ ...x, primary: k === i })) })} style={{ accentColor: "var(--o)" }} /> Primary</label>
            {d.racquets.length > 1 && <button type="button" className="small" onClick={() => remove(i)}>Remove</button>}
          </div>
          <select className="inp" style={{ marginBottom: 8 }} value={r.custom ? "__other" : r.brand}
            onChange={(e) => e.target.value === "__other" ? upd(i, { custom: true, brand: "", model: "" }) : upd(i, { custom: false, brand: e.target.value, model: "" })}>
            <option value="">Brand…</option>
            {Object.keys(models).map((b) => <option key={b}>{b}</option>)}
            <option value="__other">Not listed – type my own</option>
          </select>
          {r.custom ? (
            <>
              <div className="row">
                <input className="inp" placeholder="Brand" value={r.brand} onChange={(e) => upd(i, { brand: e.target.value })} />
                <input className="inp" placeholder="Model" value={r.model} onChange={(e) => upd(i, { model: e.target.value })} />
              </div>
              <div className="hint">Racquets you type in only appear on your own profile, not in the list for others.</div>
            </>
          ) : r.brand ? (
            <select className="inp" value={r.model} onChange={(e) => upd(i, { model: e.target.value })}>
              <option value="">Model…</option>
              {(models[r.brand] ?? [r.model]).map((m) => <option key={m}>{m}</option>)}
            </select>
          ) : null}
        </div>
      ))}
      {d.racquets.length < 3 && <button type="button" className="btn ghost" onClick={() => set({ racquets: [...d.racquets, { brand: "", model: "", custom: false, primary: false }] })}>+ Add another racquet</button>}
    </>
  );
}

export function AvatarPicker({ d, set }: { d: Draft; set: Set }) {
  const { toast } = useUi();
  const [busy, setBusy] = useState(false);
  const upload = async (f?: File) => {
    if (!f) return;
    setBusy(true);
    try {
      const fd = new FormData(); fd.append("photo", f);
      const r = await api.post<{ photoUrl: string }>("/me/photo", fd);
      set({ photoUrl: r.photoUrl });
    } catch (e: any) { toast(e.message); } finally { setBusy(false); }
  };
  const chooseAvatar = async (i: number) => {
    if (d.photoUrl) { try { await api.del("/me/photo"); } catch { /* keep going */ } }
    set({ avatar: i, photoUrl: null });
  };
  return (
    <>
      <div style={{ textAlign: "center", margin: "10px 0 14px" }}>
        {d.photoUrl ? <span className="av" style={{ width: 96, height: 96 }}><img src={d.photoUrl} alt="Your photo" /></span>
          : <span className="av" style={{ width: 96, height: 96 }} dangerouslySetInnerHTML={{ __html: avatarSVG(d.avatar) }} />}
      </div>
      <label className="btn ghost" style={{ cursor: "pointer" }}>
        {busy ? "Uploading…" : d.photoUrl ? "Upload a different photo" : "Upload a photo"}
        <input type="file" accept="image/jpeg,image/png,image/webp" style={{ display: "none" }} onChange={(e) => upload(e.target.files?.[0])} />
      </label>
      <div className="hint" style={{ textAlign: "center" }}>JPG, PNG or WebP, up to 5 MB.</div>
      <div className="h2" style={{ marginTop: 18 }}>Or choose an avatar</div>
      <div className="avgrid">
        {AVATAR_NAMES.map((n, i) => (
          <button type="button" key={n} title={n} aria-label={n} className={d.avatar === i && !d.photoUrl ? "on" : ""} onClick={() => chooseAvatar(i)} dangerouslySetInnerHTML={{ __html: avatarSVG(i) }} />
        ))}
      </div>
    </>
  );
}

/** Builds the PUT /me body from the draft. */
export function profileBody(d: Draft) {
  return {
    gender: d.gender || undefined, dob: d.dob || undefined, nationality: d.nationality,
    whatsapp: d.wa.trim() ? `${d.waCode} ${d.wa.trim()}` : "",
    heightUnit: d.heightUnit, heightCm: heightCm(d),
    hand: d.hand || undefined, backhand: d.backhand || null, shot: d.shot || null,
    homeCourt: d.homeCourt, secCourts: d.secCourts,
    racquets: d.racquets.map((r) => ({ brand: r.brand.trim(), model: r.model.trim(), custom: r.custom, primary: r.primary })),
    avatar: d.avatar,
  };
}
