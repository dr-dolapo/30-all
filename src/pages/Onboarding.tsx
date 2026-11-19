import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { ageOn } from "../../shared/rules";
import { api } from "../api";
import { AboutFields, AvatarPicker, CourtPicker, draftFromMe, heightCm, profileBody, RacquetEditor, StyleFields, type Draft } from "../forms";
import { Avatar, ErrorText, Loading, TopBar, useSession } from "../ui";

const STEPS = ["about", "style", "courts", "racquets", "photo"] as const;
const TITLES = {
  about: ["About you", "Only admins see your WhatsApp. Your age and height are hidden from other players."],
  style: ["Your game", "How do you play?"],
  courts: ["Your courts", "Pick your home court and up to 2 secondary courts."],
  racquets: ["Your racquets", "Add at least 1 and up to 3. Mark one as your primary racquet."],
  photo: ["How should we recognise you?", "Upload a photo, or pick one of our 15 avatars."],
};

function check(step: (typeof STEPS)[number], d: Draft): string {
  if (step === "about") {
    if (!d.gender) return "Choose your gender";
    if (!d.dob) return "Enter your full date of birth";
    if (ageOn(d.dob, new Date()) < 18) return "30-All is for players aged 18 and over for now";
    const h = heightCm(d);
    if (h !== null && (h < 120 || h > 230)) return "Enter a height between 120 and 230 cm";
  }
  if (step === "style" && !d.hand) return "Choose left or right handed";
  if (step === "courts" && !d.homeCourt) return "Pick your home court";
  if (step === "racquets" && d.racquets.some((r) => !r.brand.trim() || !r.model.trim())) return "Finish each racquet (brand and model) or remove it";
  return "";
}

export function Onboarding() {
  const nav = useNavigate();
  const { me, refresh } = useSession();
  const [d, setD] = useState<Draft | null>(me ? draftFromMe(me) : null);
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
      await api.put("/me", { ...profileBody(d), complete: true });
      await refresh();
      nav("/welcome-done");
    } catch (e: any) { setErr(e.message); } finally { setBusy(false); }
  };

  return (
    <>
      <TopBar title="Create account" back={i === 0 ? undefined : () => setI(i - 1)} />
      <main className="narrow">
        <div className="steps">{Array.from({ length: 7 }, (_, k) => <i key={k} className={k <= i + 2 ? "on" : ""} />)}</div>
        <div className="stitle">{TITLES[step][0]}</div>
        <p className="ssub">{TITLES[step][1]}</p>
        {step === "about" && <AboutFields d={d} set={set} />}
        {step === "style" && <StyleFields d={d} set={set} />}
        {step === "courts" && <CourtPicker d={d} set={set} />}
        {step === "racquets" && <RacquetEditor d={d} set={set} />}
        {step === "photo" && <AvatarPicker d={d} set={set} />}
        <ErrorText msg={err} />
        <div style={{ marginTop: 18 }}>
          <button className="btn" onClick={next} disabled={busy}>{i === STEPS.length - 1 ? (busy ? "Saving…" : "Finish sign-up") : "Continue"}</button>
        </div>
      </main>
    </>
  );
}

export function Done() {
  const nav = useNavigate(); const { me } = useSession();
  if (!me) return <Loading />;
  return (
    <div className="welcome" style={{ textAlign: "center", alignItems: "center" }}>
      <div>
        <Avatar u={me} size={110} />
        <h2>You're in, {me.first}!</h2>
        <p>Your unique player ID</p>
        <div className="idtag" style={{ fontSize: 22, padding: "8px 16px", background: "#111" }}>{me.pid}</div>
        <p style={{ fontSize: 14, marginTop: 14 }}>Friends can find you by name or by this ID.</p>
      </div>
      <div style={{ width: "100%" }}><button className="btn" onClick={() => nav("/matches")}>Go to matches</button></div>
    </div>
  );
}
