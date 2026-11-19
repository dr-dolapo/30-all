import { useEffect, useRef, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { api, ApiError } from "../api";
import { ErrorText, TopBar, useSession, useUi } from "../ui";

export function Welcome() {
  const nav = useNavigate();
  return (
    <div className="welcome">
      <div>
        <img src="/logo-black.png" alt="30-All" />
        <h2>Your tennis.<br />Your scores.<br />Your crew.</h2>
        <p>Log your matches, settle the scoreline and see who's really on top.</p>
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
      <main>
        <form className="card" onSubmit={submit}>
          <label className="f">Email</label>
          <input className="inp" type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
          <label className="f">Password</label>
          <input className="inp" type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} required />
          <ErrorText msg={err} />
          <div style={{ marginTop: 16 }}><button className="btn" disabled={busy}>{busy ? "Logging in…" : "Log in"}</button></div>
          <p style={{ textAlign: "center", marginTop: 14 }}><Link className="link" to="/forgot">Forgot password?</Link></p>
        </form>
        <p className="small" style={{ textAlign: "center" }}>New here? <Link className="link" to="/signup">Create an account</Link></p>
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
      <main>
        {step === 1 ? (
          <form className="card" onSubmit={send}>
            <p className="ssub">Enter your email and we'll send you a 6-digit code.</p>
            <label className="f">Email</label>
            <input className="inp" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
            <ErrorText msg={err} />
            <div style={{ marginTop: 14 }}><button className="btn">Send code</button></div>
          </form>
        ) : (
          <form className="card" onSubmit={reset}>
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
  const [f, setF] = useState({ first: "", last: "", email: "", password: "" });
  const [err, setErr] = useState(""); const [busy, setBusy] = useState(false);
  const submit = async (e: React.FormEvent) => {
    e.preventDefault(); setErr(""); setBusy(true);
    try { await api.post("/auth/signup", f); nav(`/verify?email=${encodeURIComponent(f.email.trim())}`); }
    catch (e: any) { setErr(e.message); } finally { setBusy(false); }
  };
  const field = (k: keyof typeof f) => ({ value: f[k], onChange: (e: React.ChangeEvent<HTMLInputElement>) => setF({ ...f, [k]: e.target.value }) });
  return (
    <>
      <TopBar title="Create account" back="/" />
      <main>
        <div className="steps">{Array.from({ length: 7 }, (_, i) => <i key={i} className={i === 0 ? "on" : ""} />)}</div>
        <form onSubmit={submit}>
          <div className="stitle">Let's get you on court</div>
          <p className="ssub">Your name builds your player ID.</p>
          <div className="row">
            <div><label className="f">First name <span className="req">*</span></label><input className="inp" autoComplete="given-name" {...field("first")} required /></div>
            <div><label className="f">Last name <span className="req">*</span></label><input className="inp" autoComplete="family-name" {...field("last")} required /></div>
          </div>
          <label className="f">Email <span className="req">*</span></label>
          <input className="inp" type="email" autoComplete="email" {...field("email")} required />
          <label className="f">Password <span className="req">*</span></label>
          <input className="inp" type="password" autoComplete="new-password" placeholder="At least 8 characters" {...field("password")} required minLength={8} />
          <ErrorText msg={err} />
          <div style={{ marginTop: 18 }}><button className="btn" disabled={busy}>{busy ? "Sending…" : "Send verification code"}</button></div>
          <p className="small" style={{ textAlign: "center", marginTop: 12 }}>Already have an account? <Link className="link" to="/login">Log in</Link></p>
        </form>
      </main>
    </>
  );
}

export function Verify() {
  const nav = useNavigate(); const { refresh } = useSession(); const { toast } = useUi();
  const [params] = useSearchParams(); const email = params.get("email") ?? "";
  const [digits, setDigits] = useState(["", "", "", "", "", ""]);
  const [err, setErr] = useState(""); const [wait, setWait] = useState(60);
  const refs = useRef<Array<HTMLInputElement | null>>([]);
  useEffect(() => { refs.current[0]?.focus(); }, []);
  useEffect(() => { if (wait <= 0) return; const t = setTimeout(() => setWait(wait - 1), 1000); return () => clearTimeout(t); }, [wait]);

  const setDigit = (i: number, v: string) => {
    const clean = v.replace(/\D/g, "");
    if (clean.length > 1) { // pasted the whole code
      const all = clean.slice(0, 6).split(""); setDigits([...all, ...Array(6 - all.length).fill("")]); refs.current[Math.min(all.length, 5)]?.focus(); return;
    }
    const next = [...digits]; next[i] = clean; setDigits(next);
    if (clean && i < 5) refs.current[i + 1]?.focus();
  };
  const submit = async (e: React.FormEvent) => {
    e.preventDefault(); setErr("");
    const code = digits.join("");
    if (code.length < 6) return setErr("Enter all 6 digits");
    try { await api.post("/auth/verify", { email, code }); toast("✅ Email verified"); await refresh(); nav("/onboarding"); }
    catch (e: any) { setErr(e.message); }
  };
  const resend = async () => {
    try { await api.post("/auth/resend", { email }); setWait(60); toast("A new code is on its way."); }
    catch (e: any) { if (e instanceof ApiError && e.status === 429) toast(e.message); else setErr(e.message); }
  };
  return (
    <>
      <TopBar title="Create account" back="/signup" />
      <main>
        <div className="steps">{Array.from({ length: 7 }, (_, i) => <i key={i} className={i <= 1 ? "on" : ""} />)}</div>
        <form onSubmit={submit}>
          <div className="stitle">Check your email</div>
          <p className="ssub">Enter the 6-digit code we sent to <b>{email}</b>. It expires in 10 minutes.</p>
          <div className="codeboxes">
            {digits.map((d, i) => (
              <input key={i} ref={(el) => (refs.current[i] = el)} inputMode="numeric" autoComplete={i === 0 ? "one-time-code" : "off"} aria-label={`Digit ${i + 1}`}
                value={d} onChange={(e) => setDigit(i, e.target.value)}
                onKeyDown={(e) => { if (e.key === "Backspace" && !digits[i] && i > 0) refs.current[i - 1]?.focus(); }} />
            ))}
          </div>
          <div style={{ textAlign: "center" }}><ErrorText msg={err} /></div>
          <p className="small" style={{ textAlign: "center", margin: "12px 0" }}>
            {wait > 0 ? `Resend code in ${wait}s` : <>Didn't get it? <button type="button" className="link" onClick={resend}>Resend code</button></>}
          </p>
          <button className="btn">Verify email</button>
        </form>
      </main>
    </>
  );
}
