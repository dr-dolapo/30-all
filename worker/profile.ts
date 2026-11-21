import { Hono } from "hono";
import { AVATAR_COUNT, BACKHANDS, GENDERS, HANDS, NATIONALITIES, SHOTS, STATES, WHATSAPP_CODES } from "../shared/data";
import { ageOn, isISODate, lagosToday, MIN_AGE } from "../shared/rules";
import { compareScores, scoreSeason, type LbMatch } from "../shared/leaderboard";
import { weekStreak } from "../shared/streak";
import { requireUser } from "./auth";
import { bad, HttpError, newId, now, str, type AppEnv } from "./lib";
import { PUBLIC_COLS, publicUser, recordFor, sideOf, userCourts, userRacquets, photoUrl } from "./queries";
import { emphasise } from "../shared/notifText";

export const profile = new Hono<AppEnv>();

/* ---------- me ---------- */

profile.get("/me", requireUser({ allowOnboarding: true }), async (c) => {
  const u = c.get("user");
  const [courts, racquets, unread, favs] = await Promise.all([
    userCourts(c.env, u.id),
    userRacquets(c.env, u.id),
    c.env.DB.prepare("SELECT COUNT(*) AS n FROM notifications WHERE user_id = ? AND read_at IS NULL").bind(u.id).first<{ n: number }>(),
    c.env.DB.prepare("SELECT fav_id FROM favourites WHERE user_id = ?").bind(u.id).all<{ fav_id: string }>(),
  ]);
  return c.json({
    ...publicUser(u), email: u.email, status: u.status, isAdmin: !!u.is_admin, gender: u.gender, dob: u.dob,
    whatsapp: u.whatsapp, heightCm: u.height_cm, heightUnit: u.height_unit,
    courts, racquets, unread: unread?.n ?? 0, favourites: favs.results.map((f) => f.fav_id),
  });
});

const oneOf = <T extends readonly string[]>(list: T, v: unknown): v is T[number] => typeof v === "string" && (list as readonly string[]).includes(v);

/**
 * Saves the profile. During onboarding, `complete: true` finishes sign-up and requires every mandatory field.
 * Email can't be changed here, and date of birth can only be set during onboarding (admins change it later).
 */
profile.put("/me", requireUser({ allowOnboarding: true }), async (c) => {
  const u = c.get("user");
  const b = await c.req.json().catch(() => ({}));
  const onboarding = u.status === "onboarding";
  const sets: string[] = [], vals: unknown[] = [];
  const set = (col: string, v: unknown) => { sets.push(`${col} = ?`); vals.push(v); };

  if (b.first !== undefined || b.last !== undefined) {
    const first = str(b.first, 50), last = str(b.last, 50);
    if (!first || !last) throw bad("Name can't be empty");
    set("first_name", first); set("last_name", last); // player ID stays the same
  }
  if (b.gender !== undefined) { if (!oneOf(GENDERS, b.gender)) throw bad("Choose a gender"); set("gender", b.gender); }
  if (b.dob !== undefined && b.dob !== u.dob) {
    if (!onboarding) throw new HttpError(403, "Only an admin can change your date of birth");
    if (!isISODate(b.dob)) throw bad("Enter your full date of birth");
    if (ageOn(b.dob, new Date()) < MIN_AGE) throw bad("30-All is for players aged 18 and over for now");
    if (ageOn(b.dob, new Date()) > 110) throw bad("Check your date of birth");
    set("dob", b.dob);
  }
  if (b.nationality !== undefined) { if (!NATIONALITIES.includes(b.nationality)) throw bad("Choose a nationality"); set("nationality", b.nationality); }
  if (b.whatsapp !== undefined) {
    const w = str(b.whatsapp, 30);
    if (w) {
      const code = WHATSAPP_CODES.find((k) => w.startsWith(k));
      const digits = w.replace(/\D/g, "");
      if (!code || digits.length < 8 || digits.length > 15) throw bad("Enter a valid WhatsApp number");
    }
    set("whatsapp", w || null);
  }
  if (b.heightUnit !== undefined) { if (!["metric", "imperial"].includes(b.heightUnit)) throw bad("Bad height unit"); set("height_unit", b.heightUnit); }
  if (b.heightCm !== undefined) {
    if (b.heightCm !== null && (!Number.isInteger(b.heightCm) || b.heightCm < 120 || b.heightCm > 230)) throw bad("Height must be between 120 and 230 cm");
    set("height_cm", b.heightCm);
  }
  if (b.hand !== undefined) { if (!oneOf(HANDS, b.hand)) throw bad("Choose left or right handed"); set("hand", b.hand); }
  if (b.backhand !== undefined) { if (b.backhand !== null && !oneOf(BACKHANDS, b.backhand)) throw bad("Choose a backhand"); set("backhand", b.backhand); }
  if (b.shot !== undefined) { if (b.shot !== null && !oneOf(SHOTS, b.shot)) throw bad("Choose a favourite shot"); set("fav_shot", b.shot); }
  if (b.avatar !== undefined) { if (!Number.isInteger(b.avatar) || b.avatar < 0 || b.avatar >= AVATAR_COUNT) throw bad("Choose an avatar"); set("avatar", b.avatar); }

  const stmts: D1PreparedStatement[] = [];

  // Courts: home (required) + up to 2 secondary. Must be approved, or pending courts this player submitted.
  if (b.homeCourt !== undefined || b.secCourts !== undefined) {
    const home = str(b.homeCourt, 64);
    const sec: string[] = Array.isArray(b.secCourts) ? [...new Set(b.secCourts.map((x: unknown) => str(x, 64)).filter(Boolean) as string[])] : [];
    if (!home) throw bad("Pick your home court");
    if (sec.length > 2) throw bad("You can pick up to 2 secondary courts");
    if (sec.includes(home)) throw bad("Your home court can't also be a secondary court");
    const all = [home, ...sec];
    const { results } = await c.env.DB.prepare(`SELECT id, status, submitted_by FROM courts WHERE id IN (${all.map(() => "?").join(",")})`).bind(...all).all<{ id: string; status: string; submitted_by: string | null }>();
    for (const id of all) {
      const ct = results.find((r) => r.id === id);
      if (!ct || !(ct.status === "approved" || (ct.status === "pending" && ct.submitted_by === u.id))) throw bad("One of those courts isn't available");
    }
    stmts.push(c.env.DB.prepare("DELETE FROM user_courts WHERE user_id = ?").bind(u.id));
    stmts.push(c.env.DB.prepare("INSERT INTO user_courts (user_id,court_id,role,position) VALUES (?,?,'home',0)").bind(u.id, home));
    sec.forEach((id, i) => stmts.push(c.env.DB.prepare("INSERT INTO user_courts (user_id,court_id,role,position) VALUES (?,?,'secondary',?)").bind(u.id, id, i)));
  }

  // Racquets: 1–3, exactly one primary. Listed ones must exist; custom ones are free text.
  if (b.racquets !== undefined) {
    if (!Array.isArray(b.racquets) || b.racquets.length > 3) throw bad("You can add up to 3 racquets");
    const rs = b.racquets.map((r: any) => ({ brand: str(r?.brand, 40), model: str(r?.model, 60), custom: !!r?.custom, primary: !!r?.primary }));
    if (rs.some((r: any) => !r.brand || !r.model)) throw bad("Each racquet needs a brand and model");
    if (rs.filter((r: any) => r.primary).length !== 1) throw bad("Mark exactly one racquet as primary");
    for (const r of rs) {
      if (r.custom) continue;
      const ok = await c.env.DB.prepare("SELECT 1 FROM racquet_models WHERE brand = ? AND model = ?").bind(r.brand, r.model).first();
      if (!ok) throw bad(`${r.brand} ${r.model} isn't on the list. Choose "Not listed" to type it in.`);
    }
    stmts.push(c.env.DB.prepare("DELETE FROM user_racquets WHERE user_id = ?").bind(u.id));
    rs.forEach((r: any, i: number) => stmts.push(
      c.env.DB.prepare("INSERT INTO user_racquets (user_id,position,brand,model,is_custom,is_primary) VALUES (?,?,?,?,?,?)").bind(u.id, i, r.brand, r.model, r.custom ? 1 : 0, r.primary ? 1 : 0),
    ));
  }

  if (sets.length) stmts.unshift(c.env.DB.prepare(`UPDATE users SET ${sets.join(", ")} WHERE id = ?`).bind(...vals, u.id));
  if (stmts.length) await c.env.DB.batch(stmts);

  if (onboarding && b.complete) {
    // sign-up only needs what's required to play and be found; game, racquets, WhatsApp and height come later
    const fresh = await c.env.DB.prepare("SELECT gender, dob, nationality FROM users WHERE id = ?").bind(u.id).first<any>();
    const home = await c.env.DB.prepare("SELECT 1 FROM user_courts WHERE user_id = ? AND role = 'home'").bind(u.id).first();
    const missing = [!fresh.gender && "gender", !fresh.dob && "date of birth", !fresh.nationality && "nationality", !home && "home court"].filter(Boolean);
    if (missing.length) throw bad(`Still needed: ${missing.join(", ")}`);
    await c.env.DB.prepare("UPDATE users SET status = 'active' WHERE id = ?").bind(u.id).run();
    await c.env.DB.prepare("INSERT INTO notifications (id,user_id,text,created_at) VALUES (?,?,?,?)").bind(newId(), u.id, emphasise(`Welcome to 30-All! Your player ID is ${u.pid}.`), now()).run();
  }
  return c.json({ ok: true });
});

/* ---------- photos (R2) ---------- */

const MAX_PHOTO = 5 * 1024 * 1024;
const PHOTO_TYPES = ["image/jpeg", "image/png", "image/webp"];

profile.post("/me/photo", requireUser({ allowOnboarding: true }), async (c) => {
  const u = c.get("user");
  const form = await c.req.formData().catch(() => null);
  const entry = form?.get("photo") as unknown;
  if (!entry || typeof entry === "string") throw bad("Choose a photo");
  const file = entry as File;
  if (!PHOTO_TYPES.includes(file.type)) throw bad("Use a JPG, PNG or WebP image");
  if (file.size > MAX_PHOTO) throw bad("Photos must be under 5 MB");
  const key = `photos/${u.id}/${now()}`;
  await c.env.PHOTOS.put(key, await file.arrayBuffer(), { httpMetadata: { contentType: file.type } });
  if (u.photo_key) await c.env.PHOTOS.delete(u.photo_key);
  await c.env.DB.prepare("UPDATE users SET photo_key = ? WHERE id = ?").bind(key, u.id).run();
  return c.json({ photoUrl: photoUrl(key) });
});

profile.delete("/me/photo", requireUser({ allowOnboarding: true }), async (c) => {
  const u = c.get("user");
  if (u.photo_key) await c.env.PHOTOS.delete(u.photo_key);
  await c.env.DB.prepare("UPDATE users SET photo_key = NULL WHERE id = ?").bind(u.id).run();
  return c.json({ ok: true });
});

profile.get("/photos/:key{.+}", requireUser({ allowOnboarding: true }), async (c) => {
  const obj = await c.env.PHOTOS.get(decodeURIComponent(c.req.param("key")));
  if (!obj) return c.notFound();
  return new Response(obj.body, { headers: { "Content-Type": obj.httpMetadata?.contentType ?? "image/jpeg", "Cache-Control": "private, max-age=86400" } });
});

/* ---------- reference data ---------- */

profile.get("/ref/courts", requireUser({ allowOnboarding: true }), async (c) => {
  const u = c.get("user");
  const state = c.req.query("state");
  const q = state
    // busiest courts first, with how many players call them home or play there
    ? c.env.DB.prepare(`SELECT ct.id, ct.name, ct.state, ct.area, ct.address, ct.status,
        (SELECT COUNT(*) FROM user_courts uc JOIN users pu ON pu.id = uc.user_id WHERE uc.court_id = ct.id AND pu.status = 'active') AS players
        FROM courts ct WHERE ct.state = ? AND (ct.status = 'approved' OR (ct.status = 'pending' AND ct.submitted_by = ?)) ORDER BY players DESC, ct.name`).bind(state, u.id)
    : c.env.DB.prepare("SELECT id, name, state, area, address, status FROM courts WHERE status = 'approved' ORDER BY state, name");
  return c.json((await q.all()).results);
});

/** For "You're in": a few players who share your home court, most recently active first. */
profile.get("/me/court-mates", requireUser(), async (c) => {
  const u = c.get("user");
  const { results } = await c.env.DB.prepare(`SELECT ${PUBLIC_COLS}, ct.name AS court,
      (SELECT MAX(m.match_date) FROM match_players mp JOIN matches m ON m.id = mp.match_id WHERE mp.user_id = u.id AND m.status = 'confirmed') AS lastPlayed
    FROM user_courts mine JOIN user_courts uc ON uc.court_id = mine.court_id JOIN users u ON u.id = uc.user_id JOIN courts ct ON ct.id = mine.court_id
    WHERE mine.user_id = ? AND mine.role = 'home' AND u.id != ? AND u.status = 'active'
    ORDER BY lastPlayed IS NULL, lastPlayed DESC LIMIT 3`).bind(u.id, u.id).all<any>();
  return c.json(results.map((r) => ({ ...publicUser(r), court: r.court, lastPlayed: r.lastPlayed })));
});

profile.post("/courts", requireUser({ allowOnboarding: true }), async (c) => {
  const u = c.get("user");
  const b = await c.req.json().catch(() => ({}));
  const name = str(b.name, 100), address = str(b.address, 200), state = str(b.state, 40);
  if (!name || !address) throw bad("Add the court's name and approximate address");
  if (!STATES.includes(state)) throw bad("Choose a state");
  const mine = await c.env.DB.prepare("SELECT COUNT(*) AS n FROM courts WHERE submitted_by = ? AND status = 'pending'").bind(u.id).first<{ n: number }>();
  if ((mine?.n ?? 0) >= 5) throw bad("You already have 5 courts waiting for approval");
  const id = newId();
  await c.env.DB.prepare("INSERT INTO courts (id,name,state,area,address,status,submitted_by,created_at) VALUES (?,?,?,?,?,'pending',?,?)")
    .bind(id, name, state, address, address, u.id, now()).run();
  return c.json({ id, name, state, area: address, address, status: "pending" });
});

profile.get("/ref/racquets", requireUser({ allowOnboarding: true }), async (c) => {
  const { results } = await c.env.DB.prepare("SELECT brand, model FROM racquet_models ORDER BY id").all<{ brand: string; model: string }>();
  const out: Record<string, string[]> = {};
  for (const r of results) (out[r.brand] ??= []).push(r.model);
  return c.json(out);
});

/* ---------- players & favourites ---------- */

profile.get("/players", requireUser(), async (c) => {
  const u = c.get("user");
  const q = str(c.req.query("q"), 60).toLowerCase();
  const like = `%${q.replace(/[%_]/g, "")}%`;
  const { results } = q
    ? await c.env.DB.prepare(
      `SELECT ${PUBLIC_COLS}, (SELECT name FROM courts c JOIN user_courts uc ON uc.court_id = c.id WHERE uc.user_id = u.id AND uc.role='home') AS home
       FROM users u WHERE u.status = 'active' AND u.id != ? AND (lower(u.first_name) LIKE ? OR lower(u.last_name) LIKE ? OR lower(u.pid) LIKE ?) ORDER BY u.first_name LIMIT 40`,
    ).bind(u.id, like, like, like).all<any>()
    : await c.env.DB.prepare(
      `SELECT ${PUBLIC_COLS}, (SELECT name FROM courts c JOIN user_courts uc ON uc.court_id = c.id WHERE uc.user_id = u.id AND uc.role='home') AS home
       FROM users u WHERE u.status = 'active' AND u.id != ? ORDER BY u.first_name LIMIT 300`,
    ).bind(u.id).all<any>();
  return c.json(results.map((r) => ({ ...publicUser(r), homeCourt: r.home })));
});

/** The Players tab: this season's table, everyone active, ranked by show-up points. */
profile.get("/leaderboard", requireUser(), async (c) => {
  const today = lagosToday();
  const season = /^\d{4}$/.test(c.req.query("season") ?? "") ? c.req.query("season")! : today.slice(0, 4);
  const [{ results: rows }, { results: users }] = await Promise.all([
    c.env.DB.prepare(`SELECT m.id, m.match_date AS date, m.type, m.winner_side AS winner, mp.user_id AS uid, mp.side
      FROM matches m JOIN match_players mp ON mp.match_id = m.id WHERE m.status = 'confirmed' ORDER BY m.match_date, m.submitted_at, m.id`).all<any>(),
    c.env.DB.prepare(`SELECT ${PUBLIC_COLS} FROM users u WHERE u.status = 'active'`).all<any>(),
  ]);
  const matches: LbMatch[] = []; const days = new Map<string, string[]>();
  for (const r of rows) {
    let m = matches[matches.length - 1];
    if (!m || m.id !== r.id) { m = { id: r.id, date: r.date, type: r.type, winner: r.winner, players: [] }; matches.push(m); }
    m.players.push({ id: r.uid, side: r.side });
    (days.get(r.uid) ?? days.set(r.uid, []).get(r.uid)!).push(r.date);
  }
  const scores = scoreSeason(matches, season);
  const table = users.map((u) => {
    const s = scores.get(u.id) ?? { id: u.id, pts: 0, won: 0, lost: 0, lastWin: null };
    return { ...s, name: `${u.first_name} ${u.last_name}`, user: publicUser(u), streak: weekStreak(days.get(u.id) ?? [], today) };
  }).sort(compareScores);
  return c.json({ season, players: table.map((t, i) => ({ rank: i + 1, pts: t.pts, won: t.won, lost: t.lost, streak: t.streak, ...t.user })) });
});

profile.get("/players/:id", requireUser(), async (c) => {
  const me = c.get("user");
  const id = c.req.param("id");
  const u = await c.env.DB.prepare(`SELECT ${PUBLIC_COLS}, u.status FROM users u WHERE u.id = ? AND u.status != 'deleted'`).bind(id).first<any>();
  if (!u) return c.json({ error: "Player not found" }, 404);
  const [courts, racquets, rec, fav] = await Promise.all([
    userCourts(c.env, id), userRacquets(c.env, id), recordFor(c.env, id),
    c.env.DB.prepare("SELECT 1 FROM favourites WHERE user_id = ? AND fav_id = ?").bind(me.id, id).first(),
  ]);
  const h2h = rec.matches.filter((m) => { const a = sideOf(m, id), b = sideOf(m, me.id); return a && b && a !== b; });
  // play tracker: confirmed matches per day played (Lagos dates), from when they joined or first played
  const days: Record<string, number> = {};
  for (const m of rec.matches) days[m.date] = (days[m.date] ?? 0) + 1;
  const joined = await c.env.DB.prepare("SELECT date(created_at / 1000 + 3600, 'unixepoch') AS d FROM users WHERE id = ?").bind(id).first<{ d: string }>();
  const since = [joined?.d, ...Object.keys(days)].filter(Boolean).sort()[0] as string;
  return c.json({
    ...publicUser(u),
    courts: courts.filter((ct) => ct.status === "approved" || id === me.id), // others see pending courts only once approved
    racquets, record: { played: rec.played, won: rec.won, lost: rec.lost, form: rec.form },
    isFavourite: !!fav,
    activity: { days, since },
    h2h: { played: h2h.length, myWins: h2h.filter((m) => m.winner === sideOf(m, me.id)).length, matches: h2h },
  });
});

profile.put("/favourites/:id", requireUser(), async (c) => {
  const me = c.get("user"), id = c.req.param("id");
  if (id === me.id) throw bad("You can't favourite yourself");
  const ok = await c.env.DB.prepare("SELECT 1 FROM users WHERE id = ? AND status = 'active'").bind(id).first();
  if (!ok) throw bad("Player not found");
  await c.env.DB.prepare("INSERT OR IGNORE INTO favourites (user_id,fav_id,created_at) VALUES (?,?,?)").bind(me.id, id, now()).run();
  return c.json({ ok: true });
});

profile.delete("/favourites/:id", requireUser(), async (c) => {
  await c.env.DB.prepare("DELETE FROM favourites WHERE user_id = ? AND fav_id = ?").bind(c.get("user").id, c.req.param("id")).run();
  return c.json({ ok: true });
});

profile.get("/favourites", requireUser(), async (c) => {
  const { results } = await c.env.DB.prepare(
    `SELECT ${PUBLIC_COLS}, (SELECT name FROM courts c JOIN user_courts uc ON uc.court_id = c.id WHERE uc.user_id = u.id AND uc.role='home') AS home
     FROM favourites f JOIN users u ON u.id = f.fav_id WHERE f.user_id = ? AND u.status = 'active' ORDER BY u.first_name`,
  ).bind(c.get("user").id).all<any>();
  return c.json(results.map((r) => ({ ...publicUser(r), homeCourt: r.home })));
});

/* ---------- notifications ---------- */

profile.get("/notifications", requireUser(), async (c) => {
  const { results } = await c.env.DB.prepare("SELECT id, text, match_id AS matchId, created_at AS at, read_at AS readAt FROM notifications WHERE user_id = ? ORDER BY created_at DESC LIMIT 100")
    .bind(c.get("user").id).all<{ text: string }>();
  // older notifications were stored as plain text; mark their key details on the way out
  return c.json(results.map((n) => ({ ...n, text: emphasise(n.text) })));
});

profile.post("/notifications/read", requireUser(), async (c) => {
  await c.env.DB.prepare("UPDATE notifications SET read_at = ? WHERE user_id = ? AND read_at IS NULL").bind(now(), c.get("user").id).run();
  return c.json({ ok: true });
});
