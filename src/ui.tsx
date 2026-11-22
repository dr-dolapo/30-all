import { createContext, useCallback, useContext, useEffect, useId, useRef, useState, type ReactNode } from "react";
import { Link, NavLink, useLocation, useNavigate } from "react-router-dom";
import { avatarSVG } from "../shared/avatars";
import { FORMATS } from "../shared/rules";
import { api, type Match, type Me, type PublicUser } from "./api";
import { Bell, CaretLeft, CaretRight, TennisBall, User, UsersThree } from "./icons";

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
  const [msg, setMsg] = useState<{ id: number; node: ReactNode } | null>(null);
  const [dlg, setDlg] = useState<DialogOpts | null>(null);
  const toast = useCallback((node: ReactNode) => setMsg({ id: Date.now(), node }), []);
  return (
    <UiCtx.Provider value={{ toast, confirm: setDlg }}>
      {children}
      {msg && <Toast key={msg.id} onDone={() => setMsg(null)}>{msg.node}</Toast>}
      {dlg && <ConfirmDialog key={dlg.title} opts={dlg} onDone={() => setDlg(null)} />}
    </UiCtx.Provider>
  );
}

/* ---------- layout ---------- */

let firstView = true;
/** The screen's heading. Also names the browser tab, and after an in-app navigation takes focus so screen readers announce the new screen. */
export function TopBar({ title, back, right, dark }: { title: ReactNode; back?: string | (() => void); right?: ReactNode; dark?: boolean }) {
  const nav = useNavigate();
  const { pathname } = useLocation();
  const h1 = useRef<HTMLHeadingElement>(null);
  useEffect(() => { const t = h1.current?.textContent?.trim(); document.title = t ? `${t} · 30-All` : "30-All"; });
  useEffect(() => { if (firstView) { firstView = false; return; } h1.current?.focus({ preventScroll: true }); }, [pathname]);
  return (
    <div className={"top" + (dark ? " admintop" : "")}>
      {back ? <button className="back" aria-label="Back" onClick={() => (typeof back === "string" ? nav(back) : back())}><CaretLeft size={22} weight="bold" /></button>
        : <img src={dark ? "/logo-white.png" : "/logo-black.png"} alt="30-All" />}
      <h1 ref={h1} tabIndex={-1}>{title}</h1>
      {right}
    </div>
  );
}

const ICON = {
  matches: (on: boolean) => <TennisBall size={22} weight={on ? "fill" : "regular"} />,
  players: (on: boolean) => <UsersThree size={22} weight={on ? "fill" : "regular"} />,
  inbox: (on: boolean) => <Bell size={22} weight={on ? "fill" : "regular"} />,
  me: (on: boolean) => <User size={22} weight={on ? "fill" : "regular"} />,
};

export function BottomNav({ pending = 0 }: { pending?: number }) {
  const { me } = useSession();
  const item = (to: string, icon: (on: boolean) => ReactNode, label: string, badge?: number) => (
    <NavLink to={to} className={({ isActive }) => (isActive ? "act" : "")}>
      {({ isActive }) => <>{icon(isActive)}{badge ? <span className="badge">{badge > 99 ? "99+" : badge}</span> : null}{label}</>}
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
    ? <span className="av" aria-hidden="true" style={{ width: size, height: size }}><img src={u.photoUrl} alt="" /></span>
    : <span className="av" aria-hidden="true" style={{ width: size, height: size }} dangerouslySetInnerHTML={{ __html: avatarSVG(u?.avatar ?? 0) }} />;
}

export const fullName = (u?: { first: string; last: string } | null) => (u ? `${u.first} ${u.last}` : "");
export const fmtDate = (s: string) => new Date(s + "T12:00:00").toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short", year: "numeric" });
export const ago = (t: number) => {
  const m = Math.round((Date.now() - t) / 60000);
  if (m < 1) return "just now"; if (m < 60) return `${m}m ago`;
  const h = Math.round(m / 60); if (h < 24) return `${h}h ago`;
  return `${Math.round(h / 24)}d ago`;
};

/* ---------- score card (the one match card used everywhere) ---------- */

const shortName = (p: PublicUser) => `${p.first} ${p.last.charAt(0)}.`;
const byName = (a: PublicUser, b: PublicUser) => `${a.first} ${a.last}`.localeCompare(`${b.first} ${b.last}`);

function TeamSide({ team, won }: { team: PublicUser[]; won: boolean }) {
  const ps = [...team].sort(byName); // always alphabetical, not by who entered the score
  return (
    <div className={"sc-team" + (won ? " won" : " lost")}>
      <div className={"sc-avs" + (ps.length > 1 ? " duo" : "")}>
        {ps.map((p) => <Link key={p.id} to={`/players/${p.id}`} tabIndex={-1} aria-hidden="true"><Avatar u={p} size={ps.length > 1 ? 56 : 68} /></Link>)}
      </div>
      <div className="sc-names">{ps.map((p) => <Link key={p.id} to={`/players/${p.id}`} title={fullName(p)}><span className="fn">{p.first}</span><span className="ln">{p.last.charAt(0)}.</span></Link>)}</div>
    </div>
  );
}

/** Winner on the left (bold), loser on the right (grey), each set's winning score bold, court at the bottom. */
export function ScoreCard({ m, showDate, actions, showConfirmed }: { m: Match; showDate?: boolean; actions?: ReactNode; showConfirmed?: boolean }) {
  const W = m.winner === "A" ? m.teamA : m.teamB, L = m.winner === "A" ? m.teamB : m.teamA;
  const sets = m.sets.map(([a, b]) => (m.winner === "A" ? [a, b] : [b, a]));
  let status: ReactNode = null;
  if (m.status === "pending") {
    const left = Math.max(0, Math.ceil(((m.expiresAt ?? m.submittedAt + 7 * 864e5) - Date.now()) / 864e5));
    status = <span className="pill pend">Pending · {left}d left</span>;
  }
  if (m.status === "rejected") status = <span className="pill bad">Rejected</span>;
  if (m.status === "expired") status = <span className="pill bad">Expired</span>;
  if (m.status === "confirmed" && showConfirmed) status = <span className="pill ok">Confirmed</span>;
  return (
    <article className="scard" aria-label={`${W.map(shortName).join(" & ")} beat ${L.map(shortName).join(" & ")}`}>
      {(showDate || status) && (
        <div className="sc-top">
          <span>{showDate ? new Date(m.date + "T12:00:00").toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" }) : ""}</span>
          {status}
        </div>
      )}
      <div className="scard-row">
        <TeamSide team={W} won />
        <div className="sc-score">
          {sets.map(([w, l], i) => (
            <div key={i} className="sc-set"><span className={w > l ? "b" : ""}>{w}</span><span className="dash">-</span><span className={l > w ? "b" : ""}>{l}</span></div>
          ))}
        </div>
        <TeamSide team={L} won={false} />
      </div>
      {m.court && <div className="sc-court">{m.court.name}</div>}
      {actions && <div className="sc-actions">{actions}</div>}
    </article>
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
        <button onClick={() => move(-1)} aria-label="Previous month"><CaretLeft size={18} weight="bold" /></button>
        <b>{first.toLocaleDateString("en-GB", { month: "long", year: "numeric" })}</b>
        <button onClick={() => move(1)} aria-label="Next month"><CaretRight size={18} weight="bold" /></button>
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

/** Sign-up progress: "Step 3 of 7" over a segmented bar. */
/** Sign-up is 5 steps: account, verify email, about you, home court, photo. */
export const SIGNUP_STEPS = 5;

export function StepBar({ step, total = SIGNUP_STEPS }: { step: number; total?: number }) {
  return (
    <div className="stepbar">
      <div className="steplabel">Step {step} of {total}</div>
      <div className="steps" role="progressbar" aria-valuemin={1} aria-valuemax={total} aria-valuenow={step} aria-label={`Step ${step} of ${total}`}>
        {Array.from({ length: total }, (_, i) => <i key={i} className={i < step ? "on" : ""} />)}
      </div>
    </div>
  );
}

/** A player's record: one big win–loss figure, win rate, and recent form. */
export function RecordBlock({ record }: { record: { played: number; won: number; lost: number; form: string[] } }) {
  const pct = record.played ? Math.round((record.won / record.played) * 100) : null;
  return (
    <div className="record">
      <div className="rec-big" aria-label={`${record.won} won, ${record.lost} lost`}>
        <span>{record.won}</span><span className="rec-dash">–</span><span>{record.lost}</span>
      </div>
      <div className="rec-sub">{record.played ? `${pct}% won · ${record.played} played` : "No matches yet"}</div>
      {record.form.length > 0 && (
        <div className="rec-form" aria-label="Recent form, newest first">
          {record.form.map((x, i) => <i key={i} className={x === "W" ? "w" : "l"}>{x}</i>)}
        </div>
      )}
    </div>
  );
}

/** Sets the phone's status-bar colour to match the top of the current screen, and restores white on leave. */
export function useThemeColor(color: string) {
  useEffect(() => {
    const meta = document.querySelector('meta[name="theme-color"]');
    meta?.setAttribute("content", color);
    return () => meta?.setAttribute("content", "#FFFFFF");
  }, [color]);
}

/**
 * Enter/exit for overlays (sheets, dialogs). Renders with data-state="enter", flips to "open" on the next frame
 * so CSS transitions run, and on close plays the exit before unmounting. CSS owns the motion.
 */
const FOCUSABLE = 'button:not([disabled]),[href],input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])';
/**
 * For every sheet and dialog: moves focus inside on open, keeps Tab inside the topmost one,
 * and hands focus back to whatever opened it on close.
 */
export function useDialogFocus<T extends HTMLElement = HTMLDivElement>() {
  const ref = useRef<T>(null);
  useEffect(() => {
    const el = ref.current; if (!el) return;
    const prev = document.activeElement as HTMLElement | null;
    if (!el.contains(document.activeElement)) { el.tabIndex = -1; el.focus({ preventScroll: true }); }
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Tab") return;
      const open = document.querySelectorAll('[aria-modal="true"]');
      if (open[open.length - 1] !== el) return;
      const f = [...el.querySelectorAll<HTMLElement>(FOCUSABLE)].filter((x) => x.getClientRects().length > 0);
      if (!f.length) { e.preventDefault(); return; }
      const first = f[0], last = f[f.length - 1], a = document.activeElement;
      if (!el.contains(a)) { e.preventDefault(); (e.shiftKey ? last : first).focus(); }
      else if (e.shiftKey && (a === first || a === el)) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && a === last) { e.preventDefault(); first.focus(); }
    };
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("keydown", onKey);
      if (prev && prev.isConnected) { prev.focus({ preventScroll: true }); return; }
      // the opener is gone (e.g. replaced by the picked player): fall back to the dialog underneath
      const open = [...document.querySelectorAll<HTMLElement>('[aria-modal="true"]')].filter((d) => d !== el);
      open[open.length - 1]?.focus({ preventScroll: true });
    };
  }, []);
  return ref;
}

export function usePresence(onClose: () => void, exitMs = 240) {
  const [state, setState] = useState<"enter" | "open" | "exit">("enter");
  const closing = useRef(false);
  useEffect(() => {
    let r2 = 0;
    const r1 = requestAnimationFrame(() => { r2 = requestAnimationFrame(() => setState("open")); });
    return () => { cancelAnimationFrame(r1); cancelAnimationFrame(r2); };
  }, []);
  const close = useCallback((after?: () => void) => {
    if (closing.current) return;
    closing.current = true;
    setState("exit");
    setTimeout(() => (after ?? onClose)(), exitMs);
  }, [onClose, exitMs]);
  return { state, close };
}

function ConfirmDialog({ opts, onDone }: { opts: DialogOpts; onDone: () => void }) {
  const { state, close } = usePresence(onDone, 160);
  const ref = useDialogFocus(), tid = useId();
  useEffect(() => {
    const esc = (e: KeyboardEvent) => e.key === "Escape" && close();
    window.addEventListener("keydown", esc); return () => window.removeEventListener("keydown", esc);
  }, [close]);
  return (
    <div className="dialog-bg" data-state={state} onClick={(e) => e.target === e.currentTarget && close()}>
      <div className="dialog" role="dialog" aria-modal="true" aria-labelledby={tid} ref={ref} data-state={state}>
        <h3 id={tid}>{opts.title}</h3>
        <div style={{ color: "var(--ink2)", marginBottom: 16 }}>{opts.body}</div>
        <div className="row">
          <button className="btn ghost" onClick={() => close()}>Cancel</button>
          <button className={"btn" + (opts.danger ? " bad" : "")} onClick={() => { close(); opts.onOk(); }}>{opts.ok}</button>
        </div>
      </div>
    </div>
  );
}

/** A toast enters from the top edge and leaves by the same edge (Sonner's 400ms ease). */
function Toast({ children, onDone }: { children: ReactNode; onDone: () => void }) {
  const { state, close } = usePresence(onDone, 300);
  useEffect(() => { const t = setTimeout(() => close(), 3500); return () => clearTimeout(t); }, [close]);
  return <div className="toast" role="status" data-state={state} onClick={() => close()}>{children}</div>;
}
