import { StrictMode, type ReactNode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter, Navigate, Route, Routes, useLocation } from "react-router-dom";
import { Admin, AdminUserPage } from "./pages/Admin";
import { AdminMatchPage } from "./pages/AdminMatches";
import { Forgot, Login, Signup, Verify, Welcome } from "./pages/Auth";
import { Matches } from "./pages/Matches";
import { EditProfile, Inbox, MyProfile } from "./pages/Me";
import { Done, Onboarding } from "./pages/Onboarding";
import { Player, Players } from "./pages/Players";
import "./styles.css";
import { Loading, SessionProvider, UiProvider, useSession } from "./ui";
import { ReloadWhenStale, watchForUpdates } from "./version";

/** Sends people to the right place depending on whether they're logged in and have finished sign-up. */
function Gate({ need, children }: { need: "guest" | "onboarding" | "active"; children: ReactNode }) {
  const { me, loading } = useSession();
  const loc = useLocation();
  if (loading) return <Loading />;
  if (need === "guest") return me ? <Navigate to={me.status === "onboarding" ? "/onboarding" : "/matches"} replace /> : <>{children}</>;
  if (!me) return <Navigate to="/login" replace state={{ from: loc.pathname }} />;
  if (need === "onboarding") return me.status === "onboarding" ? <>{children}</> : <Navigate to="/matches" replace />;
  if (me.status === "onboarding") return <Navigate to="/onboarding" replace />;
  return <>{children}</>;
}

watchForUpdates();

function App() {
  return (
    <div className="shell">
      <ReloadWhenStale />
      <Routes>
        <Route path="/" element={<Gate need="guest"><Welcome /></Gate>} />
        <Route path="/login" element={<Gate need="guest"><Login /></Gate>} />
        <Route path="/signup" element={<Gate need="guest"><Signup /></Gate>} />
        <Route path="/verify" element={<Verify />} />
        <Route path="/forgot" element={<Forgot />} />
        <Route path="/onboarding" element={<Gate need="onboarding"><Onboarding /></Gate>} />
        <Route path="/welcome-done" element={<Gate need="active"><Done /></Gate>} />
        <Route path="/matches" element={<Gate need="active"><Matches /></Gate>} />
        <Route path="/matches/new" element={<Navigate to="/matches" replace />} />
        <Route path="/players" element={<Gate need="active"><Players /></Gate>} />
        <Route path="/players/:id" element={<Gate need="active"><Player /></Gate>} />
        <Route path="/inbox" element={<Gate need="active"><Inbox /></Gate>} />
        <Route path="/me" element={<Gate need="active"><MyProfile /></Gate>} />
        <Route path="/me/edit" element={<Gate need="active"><EditProfile /></Gate>} />
        <Route path="/admin" element={<Gate need="active"><Admin /></Gate>} />
        <Route path="/admin/users/:id" element={<Gate need="active"><AdminUserPage /></Gate>} />
        <Route path="/admin/matches/:id" element={<Gate need="active"><AdminMatchPage /></Gate>} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </div>
  );
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <BrowserRouter>
      <SessionProvider>
        <UiProvider>
          <App />
        </UiProvider>
      </SessionProvider>
    </BrowserRouter>
  </StrictMode>,
);
