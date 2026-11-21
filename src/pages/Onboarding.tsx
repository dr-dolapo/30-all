import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { ageOn, lagosToday } from "../../shared/rules";
import { celebrated, confetti } from "../confetti";
import { AVATAR_COUNT } from "../../shared/data";
import { api, type PublicUser } from "../api";
import { AboutFields, AvatarPicker, CourtPicker, draftFromMe, type Draft } from "../forms";
import { Avatar, ErrorText, fullName, Loading, SIGNUP_STEPS, StepBar, TopBar, useSession, useThemeColor } from "../ui";

// Sign-up asks only what's needed to play and be found. Game, racquets, WhatsApp and height
// live in the "Finish your profile" checklist afterwards.
const STEPS = ["about", "courts", "photo"] as const;
const TITLES = {
  about: ["About you", "Your age stays private. It's only used for age-group events."],
  courts: ["Where do you play?", "Pick your home court. You can add 2 more later from your profile."],
  photo: ["Last thing: your look", "A real photo helps opponents recognise you at the court."],
};

function check(step: (typeof STEPS)[number], d: Draft): string {
  if (step === "about") {
    if (!d.gender) return "Choose your gender";
    if (!d.dob) return "Enter your full date of birth";
    if (ageOn(d.dob, new Date()) < 18) return "30-All is for players aged 18 and over for now";
  }
  if (step === "courts" && !d.homeCourt) return "Pick your home court";
  return "";
}

export function Onboarding() {
  const nav = useNavigate();
  const { me, refresh } = useSession();
  // an avatar is already picked, so the last step can be finished in one tap
  const [d, setD] = useState<Draft | null>(me ? { ...draftFromMe(me), avatar: me.photoUrl ? me.avatar : Math.floor(Math.random() * AVATAR_COUNT) } : null);
  const [i, setI] = useState(0);
  const [err, setErr] = useState(""); const [busy, setBusy] = useState(false);
  if (!me || !d) return <Loading />;
  const step = STEPS[i];
  const set = (p: Partial<Draft>) => { setD({ ...d, ...p }); setErr(""); };

  const next = async () => {
    const e = check(step, d);
    if (e) return setErr(e);
    if (i < STEPS.length - 1) { setI(i + 1); window.scrollTo(0, 0); return; }
    setBusy(true);
    try {
      await api.put("/me", { gender: d.gender, dob: d.dob, nationality: d.nationality, homeCourt: d.homeCourt, secCourts: [], avatar: d.avatar, complete: true });
      await refresh();
      nav("/welcome-done");
    } catch (e: any) { setErr(e.message); } finally { setBusy(false); }
  };

  return (
    <>
      <TopBar title="Create account" back={i === 0 ? undefined : () => setI(i - 1)} />
      <main className="narrow">
        <StepBar step={i + 3} total={SIGNUP_STEPS} />
        <div className="stitle">{TITLES[step][0]}</div>
        <p className="ssub">{TITLES[step][1]}</p>
        {step === "about" && <AboutFields d={d} set={set} signup />}
        {step === "courts" && <CourtPicker d={d} set={set} homeOnly />}
        {step === "photo" && <AvatarPicker d={d} set={set} compact />}
        <ErrorText msg={err} />
        <div style={{ marginTop: 18 }}>
          <button className="btn" onClick={next} disabled={busy}>{i === STEPS.length - 1 ? (busy ? "Saving…" : "Finish") : "Continue"}</button>
        </div>
      </main>
    </>
  );
}

interface Mate extends PublicUser { court: string; lastPlayed: string | null }
const ago = (iso: string) => {
  const days = Math.round((Date.parse(lagosToday()) - Date.parse(iso)) / 864e5);
  return days <= 0 ? "played today" : days === 1 ? "played yesterday" : days < 14 ? `played ${days} days ago` : `played ${Math.round(days / 7)} weeks ago`;
};

export function Done() {
  const nav = useNavigate(); const { me } = useSession();
  const [mates, setMates] = useState<Mate[]>([]);
  useThemeColor("#FF751F");
  useEffect(() => { api.get<Mate[]>("/me/court-mates").then(setMates).catch(() => {}); }, []);
  // once per player: confetti from both corners as the player ID lands
  useEffect(() => {
    if (!me || celebrated.has(me.id, "joined")) return;
    celebrated.mark(me.id, "joined");
    const t = setTimeout(() => confetti("big"), 650);
    return () => clearTimeout(t);
  }, [me?.id]);
  if (!me) return <Loading />;
  const home = me.courts.find((c) => c.role === "home");
  const invite = `https://wa.me/?text=${encodeURIComponent(`I've joined 30-All to log our tennis scores. Join me so we can track our matches: https://thirtyall.app/?ref=${me.pid}`)}`;
  return (
    <div className="welcome done" style={{ textAlign: "center", alignItems: "center" }}>
      <div style={{ width: "100%" }}>
        <div className="done-av"><Avatar u={me} size={100} /></div>
        <h2 className="done-in">You're in, {me.first}!</h2>
        <p className="done-in">Your player ID</p>
        <div className="idtag idroll" aria-label={me.pid} style={{ fontSize: 22, padding: "8px 16px", background: "#111" }}>
          {/* each character rolls up like a scoreboard digit; gaps are uneven on purpose */}
          {me.pid.split("").map((ch, i) => <span key={i} aria-hidden="true" style={{ animationDelay: `${260 + [0, 45, 110, 150, 205, 240, 290, 320, 360, 395][i % 10]}ms` }}>{ch}</span>)}
        </div>
        {mates.length > 0 && (
          <div className="mates done-in late">
            <div className="mates-h">Playing at {home?.name ?? mates[0].court}</div>
            {mates.map((m) => (
              <Link key={m.id} to={`/players/${m.id}`} className="mate">
                <Avatar u={m} size={36} />
                <span className="grow"><b>{fullName(m)}</b><small>{m.lastPlayed ? ago(m.lastPlayed) : "new on 30-All"}</small></span>
                <span className="chip">View</span>
              </Link>
            ))}
          </div>
        )}
      </div>
      <div className="done-actions">
        <button className="btn dark" onClick={() => nav("/matches?add=1")}>Log your first match</button>
        <a className="btn wa" href={invite} target="_blank" rel="noopener">Invite your hitting partner on WhatsApp</a>
        <button className="link done-skip" onClick={() => nav("/matches")}>Go to matches</button>
      </div>
    </div>
  );
}
