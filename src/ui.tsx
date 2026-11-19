import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import { Link, NavLink, useNavigate } from "react-router-dom";
import { avatarSVG } from "../shared/avatars";
import { FORMATS } from "../shared/rules";
import { api, type Match, type Me, type PublicUser } from "./api";

/* ---------- session context ---------- */

interface Session { me: Me | null; loading: boolean; refresh: () => Promise<Me | null>; setMe: (m: Me | null) => void }
const SessionCtx = createContext<Session>(null as any);
export const useSession = () => useContext(SessionCtx);

export function SessionProvider({ children }: { children: ReactNode }) {
  const [me, setMe] = useState<Me | null>(null);
  const [loading, setLoading] = useState(true);
  const refresh = useCallback(async () => {
    try { const m = await api.get<Me>("/me"); setMe(m); return m; }
    catch { setMe(null); return null; }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { refresh(); }, [refresh]);
  return <SessionCtx.Provider value={{ me, loading, refresh, setMe }}>{children}</SessionCtx.Provider>;
}

/* ---------- toasts & dialogs ---------- */

type DialogOpts = { title: string; body: ReactNode; ok: string; danger?: boolean; onOk: () => void | Promise<void> };
const UiCtx = createContext<{ toast: (msg: ReactNode) => void; confirm: (o: DialogOpts) => void }>(null as any);
export const useUi = () => useContext(UiCtx);

export function UiProvider({ children }: { children: ReactNode }) {
  const [msg, setMsg] = useState<ReactNode>(null);
  const [dlg, setDlg] = useState<DialogOpts | null>(null);
  useEffect(() => { if (!msg) return; const t = setTimeout(() => setMsg(null), 3500); return () => clearTimeout(t); }, [msg]);
  return (
    <UiCtx.Provider value={{ toast: setMsg, confirm: setDlg }}>
      {children}
      {msg && <div className="toast" role="status">{msg}</div>}
      {dlg && (
        <div className="dialog-bg" onClick={(e) => e.target === e.currentTarget && setDlg(null)}>
          <div className="dialog" role="dialog" aria-modal="true">
            <h3>{dlg.title}</h3>
            <div style={{ color: "var(--ink2)", marginBottom: 16 }}>{dlg.body}</div>
            <div className="row">
              <button className="btn ghost" onClick={() => setDlg(null)}>Cancel</button>
              <button className={"btn" + (dlg.danger ? " bad" : "")} onClick={async () => { const d = dlg; setDlg(null); await d.onOk(); }}>{dlg.ok}</button>
            </div>
          </div>
        </div>
      )}
    </UiCtx.Provider>
  );
}

/* ---------- layout ---------- */

export function TopBar({ title, back, right, dark }: { title: ReactNode; back?: string | (() => void); right?: ReactNode; dark?: boolean }) {
  const nav = useNavigate();
  return (
    <div className={"top" + (dark ? " admintop" : "")}>
      {back ? <button className="back" aria-label="Back" onClick={() => (typeof back === "string" ? nav(back) : back())}>‹</button>
        : <img src={dark ? "/logo-white.png" : "/logo-black.png"} alt="30-All" />}
      <h1>{title}</h1>
      {right}
    </div>
  );
}

const ICON = {
  matches: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="9" /><path d="M4.5 8c3 1.5 3 6.5 0 8M19.5 8c-3 1.5-3 6.5 0 8" /></svg>,
  players: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="9" cy="8" r="3.5" /><path d="M2.5 20c.5-4 3-6 6.5-6s6 2 6.5 6" /><circle cx="17" cy="9" r="2.5" /><path d="M16 14c3 0 5 1.8 5.5 5" /></svg>,
  inbox: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M6 9a6 6 0 1 1 12 0c0 5 2 6.5 2 6.5H4S6 14 6 9Z" /><path d="M10 19a2 2 0 0 0 4 0" /></svg>,
  me: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="8" r="4" /><path d="M4 21c.8-4.5 4-7 8-7s7.2 2.5 8 7" /></svg>,
};

export function BottomNav({ pending = 0 }: { pending?: number }) {
  const { me } = useSession();
  const item = (to: string, icon: ReactNode, label: string, badge?: number) => (
    <NavLink to={to} className={({ isActive }) => (isActive ? "act" : "")}>
      {icon}{badge ? <span className="badge">{badge}</span> : null}{label}
    </NavLink>
  );
  return (
    <nav className="nav">
      <div className="navbrand"><img src="/logo-black.png" alt="" /><b>30-All</b></div>
      {item("/matches", ICON.matches, "Matches", pending)}
      {item("/players", ICON.players, "Players")}
      {item("/inbox", ICON.inbox, "Inbox", me?.unread)}
      {item("/me", ICON.me, "Profile")}
    </nav>
  );
}

export function Avatar({ u, size = 40 }: { u: Pick<PublicUser, "avatar" | "photoUrl"> | null | undefined; size?: number }) {
  return u?.photoUrl
    ? <span className="av" style={{ width: size, height: size }}><img src={u.photoUrl} alt="" /></span>
    : <span className="av" style={{ width: size, height: size }} dangerouslySetInnerHTML={{ __html: avatarSVG(u?.avatar ?? 0) }} />;
}

export const fullName = (u?: { first: string; last: string } | null) => (u ? `${u.first} ${u.last}` : "");
export const fmtDate = (s: string) => new Date(s + "T12:00:00").toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short", year: "numeric" });
export const ago = (t: number) => {
  const m = Math.round((Date.now() - t) / 60000);
  if (m < 1) return "just now"; if (m < 60) return `${m}m ago`;
  const h = Math.round(m / 60); if (h < 24) return `${h}h ago`;
  return `${Math.round(h / 24)}d ago`;
};

/* ---------- match card ---------- */

export function MatchCard({ m, actions }: { m: Match; actions?: ReactNode }) {
  const F = FORMATS[m.format];
  const line = (side: "A" | "B") => {
    const team = side === "A" ? m.teamA : m.teamB, win = m.winner === side && m.status === "confirmed";
    return (
      <div className={"mline" + (m.winner === side ? " win" : "")}>
        <span className="tick">{win ? "✓" : ""}</span>
        <span style={{ display: "flex" }}>{team.map((p) => <Avatar key={p.id} u={p} size={26} />)}</span>
        <span className="who">{team.map((p, i) => <span key={p.id}>{i > 0 && " & "}<Link to={`/players/${p.id}`} style={{ textDecoration: "none" }}>{fullName(p)}</Link></span>)}</span>
        <span className="sc">{m.sets.map((s, i) => <span key={i}>{side === "A" ? s[0] : s[1]}</span>)}</span>
      </div>
    );
  };
  let status: ReactNode = null;
  if (m.status === "pending") {
    const left = Math.max(0, Math.ceil(((m.expiresAt ?? m.submittedAt + 7 * 864e5) - Date.now()) / 864e5));
    status = <span className="pill pend">Pending · {left}d left</span>;
  }
  if (m.status === "rejected") status = <span className="pill bad">Rejected</span>;
  if (m.status === "expired") status = <span className="pill bad">Expired</span>;
  const submitter = [...m.teamA, ...m.teamB].find((p) => p.id === m.submittedBy);
  return (
    <div className="match">
      <div className="meta"><span>{fmtDate(m.date)} · {m.type === "doubles" ? "Doubles" : "Singles"} · {F.label}</span>{status}</div>
      {line("A")}{line("B")}
      <div className="small" style={{ marginTop: 6 }}>📍 {m.court?.name ?? "—"} · entered by {submitter?.first}</div>
      {actions}
    </div>
  );
}

/* ---------- calendar ---------- */

const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

export function Calendar({ month, onMonth, days, selected, onSelect, min, max }: {
  month: { y: number; m: number }; onMonth: (m: { y: number; m: number }) => void;
  days: Set<string>; selected: string | null; onSelect: (d: string | null) => void;
  min?: string; max?: string; // YYYY-MM-DD; days outside are disabled
}) {
  const first = new Date(month.y, month.m, 1), start = (first.getDay() + 6) % 7;
  const weeks = Math.ceil((start + new Date(month.y, month.m + 1, 0).getDate()) / 7);
  const today = iso(new Date());
  const move = (n: number) => { let { y, m } = month; m += n; if (m < 0) { m = 11; y--; } if (m > 11) { m = 0; y++; } onMonth({ y, m }); };
  return (
    <div className="cal">
      <div className="calhead">
        <button onClick={() => move(-1)} aria-label="Previous month">‹</button>
        <b>{first.toLocaleDateString("en-GB", { month: "long", year: "numeric" })}</b>
        <button onClick={() => move(1)} aria-label="Next month">›</button>
      </div>
      <div className="calgrid">
        {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((d) => <div key={d} className="dow">{d}</div>)}
        {Array.from({ length: weeks * 7 }, (_, i) => {
          const d = new Date(month.y, month.m, 1 - start + i), s = iso(d), out = d.getMonth() !== month.m;
          return (
            <button key={s} disabled={(!!min && s < min) || (!!max && s > max)} aria-pressed={selected === s}
              className={[out && "out", s === today && "today", selected === s && "sel"].filter(Boolean).join(" ")} onClick={() => onSelect(selected === s ? null : s)}>
              {d.getDate()}{days.has(s) && <i className="dot" />}
            </button>
          );
        })}
      </div>
    </div>
  );
}

export function Loading() { return <div className="loading">Loading…</div>; }
export function ErrorText({ msg }: { msg?: string | null }) { return msg ? <div className="err" role="alert">{msg}</div> : null; }
