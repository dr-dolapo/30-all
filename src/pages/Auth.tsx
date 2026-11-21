import { useEffect, useRef, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { api, ApiError } from "../api";
import { ErrorText, StepBar, TopBar, useSession, useThemeColor, useUi } from "../ui";

/** Remember who invited this player (?ref=<player ID> on an invite link) until they sign up. */
function useInviteRef() {
  const [params] = useSearchParams();
  useEffect(() => { const r = params.get("ref"); if (r) try { localStorage.setItem("invite-ref", r.toUpperCase()); } catch { /* private mode */ } }, []);
}
const inviteRef = () => { try { return localStorage.getItem("invite-ref") ?? undefined; } catch { return undefined; } };

const HOW = [
  ["Play a match", "Singles or doubles, at any court"],
  ["Log the score in 20 seconds", "Pick your opponent, type the sets"],
  ["They confirm it", "Then it counts on the leaderboard"],
];

export function Welcome() {
  const nav = useNavigate();
  const [stats, setStats] = useState<{ players: number; courts: number } | null>(null);
  useThemeColor("#FF751F");
  useInviteRef();
  useEffect(() => { api.get<{ players: number; courts: number }>("/public/stats").then(setStats).catch(() => {}); }, []);
  return (
    <div className="welcome">
      <div>
        <img src="/logo-black.png" alt="30-All" />
        <h2>Your tennis.<br />Your scores.<br />Your crew.</h2>
        <ol className="how">
          {HOW.map(([t, s], i) => <li key={t}><i>{i + 1}</i><span><b>{t}</b><small>{s}</small></span></li>)}
        </ol>
        {/* only worth showing once there's a real crowd */}
        {stats && stats.players >= 20 && <p className="proof">{stats.players} players at {stats.courts} court{stats.courts === 1 ? "" : "s"} already</p>}
      </div>
      <div>
        <button className="btn" onClick={() => nav("/signup")}>Create account</button>
        <button className="btn ghost" onClick={() => nav("/login")}>Log in</button>
      </div>
    </div>
  );
}

export function Login() {
  const nav = useNavigate();
  const { refresh } = useSession();
  const [email, setEmail] = useState(""); const [password, setPassword] = useState("");
  const [err, setErr] = useState(""); const [busy, setBusy] = useState(false);
  const submit = async (e: React.FormEvent) => {
    e.preventDefault(); setErr(""); setBusy(true);
    try {
      const r = await api.post<{ needsVerification?: boolean }>("/auth/login", { email, password });
      if (r.needsVerification) { nav(`/verify?email=${encodeURIComponent(email)}`); return; }
      const me = await refresh();
      nav(me?.status === "onboarding" ? "/onboarding" : "/matches");
    } catch (e: any) { setErr(e.message); } finally { setBusy(false); }
  };
  return (
    <>
      <TopBar title="Log in" back="/" />
      <main className="narrow">
        <form onSubmit={submit}>
          <div className="stitle">Welcome back</div>
          <p className="ssub">Log in to enter scores and see your record.</p>
          <label className="f">Email</label>
          <input className="inp" type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
          <label className="f">Password</label>
          <input className="inp" type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} required />
          <ErrorText msg={err} />
          <div style={{ marginTop: 16 }}><button className="btn" disabled={busy}>{busy ? "Logging in…" : "Log in"}</button></div>
          <p style={{ textAlign: "center", marginTop: 14 }}><Link className="link" to="/forgot">Forgot password?</Link></p>
        </form>
        <p className="small" style={{ textAlign: "center", marginTop: 18 }}>New here? <Link className="link" to="/signup">Create an account</Link></p>
      </main>
    </>
  );
}

export function Forgot() {
  const nav = useNavigate(); const { toast } = useUi();
  const [step, setStep] = useState<1 | 2>(1);
  const [email, setEmail] = useState(""); const [code, setCode] = useState(""); const [password, setPassword] = useState("");
  const [err, setErr] = useState("");
  const send = async (e: React.FormEvent) => {
    e.preventDefault(); setErr("");
    try { await api.post("/auth/forgot", { email }); setStep(2); } catch (e: any) { setErr(e.message); }
  };
  const reset = async (e: React.FormEvent) => {
    e.preventDefault(); setErr("");
    try { await api.post("/auth/reset", { email, code, password }); toast("Password updated. Log in with your new password."); nav("/login"); }
    catch (e: any) { setErr(e.message); }
  };
  return (
    <>
      <TopBar title="Reset password" back="/login" />
      <main className="narrow">
        {step === 1 ? (
          <form onSubmit={send}>
            <div className="stitle">Reset your password</div>
            <p className="ssub">Enter your email and we'll send you a 6-digit code.</p>
            <label className="f">Email</label>
            <input className="inp" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
            <ErrorText msg={err} />
            <div style={{ marginTop: 14 }}><button className="btn">Send code</button></div>
          </form>
        ) : (
          <form onSubmit={reset}>
            <div className="stitle">Check your email</div>
            <p className="ssub">If <b>{email}</b> has an account, we've sent it a code. It expires in 10 minutes.</p>
            <label className="f">Code</label>
            <input className="inp" inputMode="numeric" maxLength={6} value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))} required />
            <label className="f">New password</label>
            <input className="inp" type="password" autoComplete="new-password" placeholder="At least 8 characters" value={password} onChange={(e) => setPassword(e.target.value)} required />
            <ErrorText msg={err} />
            <div style={{ marginTop: 14 }}><button className="btn">Set new password</button></div>
          </form>
        )}
      </main>
    </>
  );
}

export function Signup() {
  const nav = useNavigate();
  useInviteRef();
  const [f, setF] = useState({ first: "", last: "", email: "", password: "" });
  const [show, setShow] = useState(false);
  const [err, setErr] = useState(""); const [busy, setBusy] = useState(false);
  const submit = async (e: React.FormEvent) => {
    e.preventDefault(); setErr(""); setBusy(true);
    try { await api.post("/auth/signup", { ...f, ref: inviteRef() }); nav(`/verify?email=${encodeURIComponent(f.email.trim())}`); }
    catch (e: any) { setErr(e.message); } finally { setBusy(false); }
  };
  const field = (k: keyof typeof f) => ({ value: f[k], onChange: (e: React.ChangeEvent<HTMLInputElement>) => setF({ ...f, [k]: e.target.value }) });
  return (
    <>
      <TopBar title="Create account" back="/" />
      <main className="narrow">
        <StepBar step={1} />
        <div className="steptime">About a minute</div>
        <form onSubmit={submit}>
          <div className="stitle">Let's get you on court</div>
          <p className="ssub">Your friends will find you by this name.</p>
          <div className="row">
            <div><label className="f">First name <span className="req">*</span></label><input className="inp" autoComplete="given-name" {...field("first")} required /></div>
            <div><label className="f">Last name <span className="req">*</span></label><input className="inp" autoComplete="family-name" {...field("last")} required /></div>
          </div>
          <label className="f">Email <span className="req">*</span></label>
          <input className="inp" type="email" autoComplete="email" {...field("email")} required />
          <label className="f">Password <span className="req">*</span></label>
          <div className="pw">
            <input className="inp" type={show ? "text" : "password"} autoComplete="new-password" placeholder="At least 8 characters" {...field("password")} required minLength={8} />
            <button type="button" className="pw-show" onClick={() => setShow(!show)} aria-pressed={show}>{show ? "Hide" : "Show"}</button>
          </div>
          <ErrorText msg={err} />
          <div style={{ marginTop: 18 }}><button className="btn" disabled={busy}>{busy ? "Creating…" : "Create account"}</button></div>
          <p className="small" style={{ textAlign: "center", marginTop: 12 }}>Already have an account? <Link className="link" to="/login">Log in</Link></p>
        </form>
      </main>
    </>
  );
}

/** A button to the player's email app, for the big providers. */
function mailApp(email: string): { name: string; url: string } | null {
  const domain = email.split("@")[1]?.toLowerCase() ?? "";
  if (/^(gmail|googlemail)\.com$/.test(domain)) return { name: "Gmail", url: "https://mail.google.com/mail/u/0/#search/30-All" };
  if (/^(outlook|hotmail|live|msn)\./.test(domain)) return { name: "Outlook", url: "https://outlook.live.com/mail/" };
  if (/^yahoo\./.test(domain) || domain === "ymail.com") return { name: "Yahoo Mail", url: "https://mail.yahoo.com/" };
  if (/^(icloud|me|mac)\.com$/.test(domain)) return { name: "iCloud Mail", url: "https://www.icloud.com/mail" };
  return null;
}

export function Verify() {
  const nav = useNavigate(); const { refresh } = useSession(); const { toast } = useUi();
  const [params] = useSearchParams(); const email = params.get("email") ?? "";
  const [digits, setDigits] = useState(["", "", "", "", "", ""]);
  const [err, setErr] = useState(""); const [wait, setWait] = useState(60);
  const [shake, setShake] = useState(0);
  const [checking, setChecking] = useState(false);
  const tried = useRef("");
  const refs = useRef<Array<HTMLInputElement | null>>([]);
  useEffect(() => { refs.current[0]?.focus(); }, []);
  useEffect(() => { if (wait <= 0) return; const t = setTimeout(() => setWait(wait - 1), 1000); return () => clearTimeout(t); }, [wait]);

  const setDigit = (i: number, v: string) => {
    if (err) setErr("");
    const clean = v.replace(/\D/g, "");
    if (clean.length > 1) { // pasted the whole code
      const all = clean.slice(0, 6).split(""); setDigits([...all, ...Array(6 - all.length).fill("")]); refs.current[Math.min(all.length, 5)]?.focus(); return;
    }
    const next = [...digits]; next[i] = clean; setDigits(next);
    if (clean && i < 5) refs.current[i + 1]?.focus();
  };
  // checks the code as soon as the 6th digit lands (typed or pasted); no button to tap
  const submit = async (code: string) => {
    if (code.length < 6 || checking || tried.current === code) return;
    tried.current = code; setErr(""); setChecking(true);
    try { await api.post("/auth/verify", { email, code }); toast("Email verified"); await refresh(); nav("/onboarding"); }
    catch (e: any) { setErr(e.message); setShake((n) => n + 1); refs.current[5]?.select(); }
    finally { setChecking(false); }
  };
  useEffect(() => { const code = digits.join(""); if (code.length === 6) submit(code); }, [digits]);
  const mail = mailApp(email);
  const resend = async () => {
    try { await api.post("/auth/resend", { email }); setWait(60); toast("A new code is on its way."); }
    catch (e: any) { if (e instanceof ApiError && e.status === 429) toast(e.message); else setErr(e.message); }
  };
  return (
    <>
      <TopBar title="Create account" back="/signup" />
      <main className="narrow">
        <StepBar step={2} />
        <form onSubmit={(e) => { e.preventDefault(); tried.current = ""; submit(digits.join("")); }}>
          <div className="stitle">Check your email</div>
          <p className="ssub">We sent a 6-digit code to <b>{email}</b>. <Link className="link" to="/signup">Wrong email?</Link></p>
          <div className={"codeboxes" + (err ? " bad" : "")} data-shake={shake % 2 ? "a" : shake ? "b" : undefined}>
            {digits.map((d, i) => (
              <input key={i} ref={(el) => (refs.current[i] = el)} inputMode="numeric" autoComplete={i === 0 ? "one-time-code" : "off"} aria-label={`Digit ${i + 1}`}
                value={d} onChange={(e) => setDigit(i, e.target.value)}
                onKeyDown={(e) => { if (e.key === "Backspace" && !digits[i] && i > 0) refs.current[i - 1]?.focus(); }} />
            ))}
          </div>
          <div style={{ textAlign: "center" }}><ErrorText msg={err} /></div>
          {checking && <p className="verify-checking" role="status">Checking…</p>}
          {mail && <a className="btn ghost" href={mail.url} target="_blank" rel="noopener" style={{ marginTop: 14 }}>Open {mail.name}</a>}
          <p className="small" style={{ textAlign: "center", margin: "14px 0" }}>
            Didn't get it? {wait > 0 ? `Resend in ${wait}s` : <button type="button" className="link" onClick={resend}>Resend code</button>} · Check your spam folder. The code expires in 10 minutes.
          </p>
          <button type="submit" hidden aria-hidden="true" tabIndex={-1} />
        </form>
      </main>
    </>
  );
}
