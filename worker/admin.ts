import { Hono } from "hono";
import { STATES } from "../shared/data";
import { addDaysISO, ageOn, isISODate, lagosToday, MIN_AGE, scoreLine } from "../shared/rules";
import { requireUser } from "./auth";
import { bad, HttpError, newId, now, str, type AppEnv } from "./lib";
import { notify } from "./notify";
import { loadMatches, photoUrl, recordFor, userCourts, userRacquets } from "./queries";

export const admin = new Hono<AppEnv>();
admin.use("*", requireUser({ admin: true }));

/* ---------- courts ---------- */

admin.get("/courts", async (c) => {
  const { results } = await c.env.DB.prepare(
    `SELECT c.*, u.first_name || ' ' || u.last_name AS submitter,
       (SELECT COUNT(*) FROM user_courts uc WHERE uc.court_id = c.id) AS players,
       (SELECT COUNT(*) FROM matches m WHERE m.court_id = c.id) AS matches
     FROM courts c LEFT JOIN users u ON u.id = c.submitted_by
     WHERE c.status IN ('pending','approved') ORDER BY c.status = 'pending' DESC, c.state, c.name`,
  ).all();
  return c.json(results);
});

admin.post("/courts", async (c) => {
  const b = await c.req.json().catch(() => ({}));
  const name = str(b.name, 100), state = str(b.state, 40);
  if (!name || !STATES.includes(state)) throw bad("Add a name and state");
  const id = newId();
  await c.env.DB.prepare("INSERT INTO courts (id,name,state,area,address,status,created_at) VALUES (?,?,?,?,?,'approved',?)")
    .bind(id, name, state, str(b.area, 100) || null, str(b.address, 200) || null, now()).run();
  return c.json({ id });
});

/** Edit a court's details: tidy a submitted court before approving, or correct an approved one. Renames are quiet. */
admin.put("/courts/:id", async (c) => {
  const b = await c.req.json().catch(() => ({}));
  const name = str(b.name, 100), state = str(b.state, 40);
  if (!name) throw bad("Court name can't be empty");
  const ct = await c.env.DB.prepare("SELECT id, state FROM courts WHERE id = ?").bind(c.req.param("id")).first<{ id: string; state: string }>();
  if (!ct) throw new HttpError(404, "Court not found");
  if (state && !STATES.includes(state)) throw bad("Choose a state from the list");
  await c.env.DB.prepare("UPDATE courts SET name = ?, area = ?, address = ?, state = ? WHERE id = ?")
    .bind(name, str(b.area, 100) || null, str(b.address, 200) || null, state || ct.state, ct.id).run();
  return c.json({ ok: true });
});

/**
 * Moves every profile and match from one court to another. A player keeps one row per court:
 * if they already list the target, it's kept (and becomes their home court if the old one was).
 */
async function moveCourtUsage(env: AppEnv["Bindings"], fromId: string, intoId: string) {
  const { results: rows } = await env.DB.prepare("SELECT user_id, role, position FROM user_courts WHERE court_id = ?").bind(fromId).all<{ user_id: string; role: string; position: number }>();
  const stmts: D1PreparedStatement[] = [];
  for (const r of rows) {
    const has = await env.DB.prepare("SELECT role FROM user_courts WHERE user_id = ? AND court_id = ?").bind(r.user_id, intoId).first<{ role: string }>();
    stmts.push(env.DB.prepare("DELETE FROM user_courts WHERE user_id = ? AND court_id = ?").bind(r.user_id, fromId));
    if (!has) stmts.push(env.DB.prepare("INSERT INTO user_courts (user_id,court_id,role,position) VALUES (?,?,?,?)").bind(r.user_id, intoId, r.role, r.position));
    else if (r.role === "home" && has.role !== "home") stmts.push(env.DB.prepare("UPDATE user_courts SET role = 'home', position = 0 WHERE user_id = ? AND court_id = ?").bind(r.user_id, intoId));
  }
  stmts.push(env.DB.prepare("UPDATE matches SET court_id = ? WHERE court_id = ?").bind(intoId, fromId));
  return { stmts, userIds: rows.map((r) => r.user_id) };
}

/** Deletes an approved court. If players or matches use it, they move to another approved court first and those players are told. */
admin.post("/courts/:id/delete", async (c) => {
  const ct = await c.env.DB.prepare("SELECT id, name FROM courts WHERE id = ? AND status = 'approved'").bind(c.req.param("id")).first<{ id: string; name: string }>();
  if (!ct) throw new HttpError(404, "Court not found");
  const b = await c.req.json().catch(() => ({}));
  const used = await c.env.DB.prepare(
    "SELECT (SELECT COUNT(*) FROM user_courts WHERE court_id = ?1) + (SELECT COUNT(*) FROM matches WHERE court_id = ?1) AS n").bind(ct.id).first<{ n: number }>();
  let into: { id: string; name: string } | null = null;
  if (used && used.n > 0) {
    into = await c.env.DB.prepare("SELECT id, name FROM courts WHERE id = ? AND status = 'approved'").bind(str(b.into, 64)).first<{ id: string; name: string }>();
    if (!into || into.id === ct.id) throw bad("Choose another approved court to move its players and matches to");
  }
  const moved = into ? await moveCourtUsage(c.env, ct.id, into.id) : { stmts: [], userIds: [] as string[] };
  await c.env.DB.batch([
    ...moved.stmts,
    // courts that were merged into this one now point at the new court (or nowhere)
    c.env.DB.prepare("UPDATE courts SET merged_into = ? WHERE merged_into = ?").bind(into?.id ?? null, ct.id),
    c.env.DB.prepare("DELETE FROM courts WHERE id = ?").bind(ct.id),
  ]);
  if (into && moved.userIds.length) await notify(c.env, (p) => c.executionCtx.waitUntil(p), [...new Set(moved.userIds)],
    `${ct.name} was removed from 30-All. Your profile now shows ${into.name} instead.`, { subject: "Your court changed" });
  return c.json({ ok: true, moved: moved.userIds.length });
});

async function pendingCourt(c: any) {
  const ct = await c.env.DB.prepare("SELECT * FROM courts WHERE id = ?").bind(c.req.param("id")).first();
  if (!ct) throw new HttpError(404, "Court not found");
  if (ct.status !== "pending") throw bad("This court has already been reviewed");
  return ct as { id: string; name: string; submitted_by: string | null };
}

admin.post("/courts/:id/approve", async (c) => {
  const ct = await pendingCourt(c);
  await c.env.DB.prepare("UPDATE courts SET status = 'approved' WHERE id = ?").bind(ct.id).run();
  if (ct.submitted_by) await notify(c.env, (p) => c.executionCtx.waitUntil(p), [ct.submitted_by],
    `Good news: ${ct.name} was approved and now shows on your profile.`, { subject: "Your court was approved" });
  return c.json({ ok: true });
});

admin.post("/courts/:id/reject", async (c) => {
  const ct = await pendingCourt(c);
  const { results: affected } = await c.env.DB.prepare("SELECT user_id FROM user_courts WHERE court_id = ?").bind(ct.id).all<{ user_id: string }>();
  await c.env.DB.batch([
    c.env.DB.prepare("DELETE FROM user_courts WHERE court_id = ?").bind(ct.id),
    c.env.DB.prepare("UPDATE courts SET status = 'rejected' WHERE id = ?").bind(ct.id),
    c.env.DB.prepare("UPDATE matches SET court_id = NULL WHERE court_id = ?").bind(ct.id), // scores stay; the court is just unknown
  ]);
  const ids = [...new Set([ct.submitted_by, ...affected.map((a) => a.user_id)].filter(Boolean) as string[])];
  await notify(c.env, (p) => c.executionCtx.waitUntil(p), ids,
    `${ct.name} wasn't approved, so it's been removed from your profile. Pick a court from the list or submit it again with more detail.`,
    { subject: "Your court wasn't approved" });
  return c.json({ ok: true });
});

/** Merge a submitted court into an existing approved one: players' profiles move to the existing court. */
admin.post("/courts/:id/merge", async (c) => {
  const ct = await pendingCourt(c);
  const b = await c.req.json().catch(() => ({}));
  const into = await c.env.DB.prepare("SELECT id, name FROM courts WHERE id = ? AND status = 'approved'").bind(str(b.into, 64)).first<{ id: string; name: string }>();
  if (!into) throw bad("Choose an approved court to merge into");
  const { stmts, userIds } = await moveCourtUsage(c.env, ct.id, into.id);
  stmts.push(c.env.DB.prepare("UPDATE courts SET status = 'merged', merged_into = ? WHERE id = ?").bind(into.id, ct.id));
  await c.env.DB.batch(stmts);
  const ids = [...new Set([ct.submitted_by, ...userIds].filter(Boolean) as string[])];
  await notify(c.env, (p) => c.executionCtx.waitUntil(p), ids,
    `${ct.name} matched an existing court, ${into.name}. Your profile now shows ${into.name}.`, { subject: "Your court was matched" });
  return c.json({ ok: true });
});

/* ---------- users ---------- */

admin.get("/users", async (c) => {
  const { results } = await c.env.DB.prepare(
    `SELECT u.id, u.pid, u.first_name AS first, u.last_name AS last, u.email, u.whatsapp, u.gender, u.status, u.is_admin AS isAdmin,
       u.photo_key, u.avatar, u.created_at AS createdAt, hc.id AS homeCourtId, hc.name AS homeCourtName, hc.status AS homeCourtStatus
     FROM users u
     LEFT JOIN user_courts uc ON uc.user_id = u.id AND uc.role = 'home'
     LEFT JOIN courts hc ON hc.id = uc.court_id
     WHERE u.status != 'deleted' ORDER BY u.first_name, u.last_name`,
  ).all<any>();
  return c.json(results.map((r) => ({ ...r, isAdmin: !!r.isAdmin, photoUrl: photoUrl(r.photo_key), photo_key: undefined })));
});

/** Full profile for the admin "Edit" page. Date of birth is left out: it's fetched separately when the admin reveals it. */
admin.get("/users/:id", async (c) => {
  const id = c.req.param("id");
  const u = await c.env.DB.prepare(
    `SELECT id, pid, first_name AS first, last_name AS last, email, status, is_admin AS isAdmin, gender, nationality, whatsapp,
       height_cm AS heightCm, height_unit AS heightUnit, hand, backhand, fav_shot AS shot, avatar, photo_key, created_at AS createdAt
     FROM users WHERE id = ? AND status != 'deleted'`,
  ).bind(id).first<any>();
  if (!u) throw new HttpError(404, "Player not found");
  const [courts, racquets, rec] = await Promise.all([userCourts(c.env, id), userRacquets(c.env, id), recordFor(c.env, id)]);
  return c.json({
    ...u, isAdmin: !!u.isAdmin, photoUrl: photoUrl(u.photo_key), photo_key: undefined,
    courts, racquets, record: { played: rec.played, won: rec.won, lost: rec.lost, form: rec.form },
  });
});

/** Reveals date of birth and age (the admin clicked the eye icon). */
admin.get("/users/:id/dob", async (c) => {
  const u = await c.env.DB.prepare("SELECT dob FROM users WHERE id = ? AND status != 'deleted'").bind(c.req.param("id")).first<{ dob: string | null }>();
  if (!u) throw new HttpError(404, "Player not found");
  return c.json({ dob: u.dob, age: u.dob ? ageOn(u.dob, new Date()) : null });
});

admin.patch("/users/:id", async (c) => {
  const me = c.get("user"), id = c.req.param("id");
  const b = await c.req.json().catch(() => ({}));
  const u = await c.env.DB.prepare("SELECT id FROM users WHERE id = ? AND status != 'deleted'").bind(id).first();
  if (!u) throw new HttpError(404, "Player not found");
  if (b.status !== undefined) {
    if (!["active", "suspended"].includes(b.status)) throw bad("Bad status");
    if (id === me.id) throw bad("You can't suspend yourself");
    await c.env.DB.prepare("UPDATE users SET status = ? WHERE id = ? AND status IN ('active','suspended')").bind(b.status, id).run();
    if (b.status === "suspended") await c.env.DB.prepare("DELETE FROM sessions WHERE user_id = ?").bind(id).run();
  }
  if (b.dob !== undefined) {
    if (!isISODate(b.dob) || ageOn(b.dob, new Date()) < MIN_AGE) throw bad("Date of birth must make the player 18 or older");
    await c.env.DB.prepare("UPDATE users SET dob = ? WHERE id = ?").bind(b.dob, id).run();
  }
  if (b.isAdmin !== undefined) {
    if (id === me.id && !b.isAdmin) throw bad("You can't remove your own admin access");
    await c.env.DB.prepare("UPDATE users SET is_admin = ? WHERE id = ?").bind(b.isAdmin ? 1 : 0, id).run();
  }
  return c.json({ ok: true });
});

/** Changes a player's home court to an approved court and tells them. */
admin.put("/users/:id/home-court", async (c) => {
  const id = c.req.param("id");
  const b = await c.req.json().catch(() => ({}));
  const u = await c.env.DB.prepare("SELECT id FROM users WHERE id = ? AND status != 'deleted'").bind(id).first();
  if (!u) throw new HttpError(404, "Player not found");
  const court = await c.env.DB.prepare("SELECT id, name FROM courts WHERE id = ? AND status = 'approved'").bind(str(b.courtId, 64)).first<{ id: string; name: string }>();
  if (!court) throw bad("Choose an approved court");
  const current = await c.env.DB.prepare("SELECT court_id FROM user_courts WHERE user_id = ? AND role = 'home'").bind(id).first<{ court_id: string }>();
  if (current?.court_id === court.id) throw bad("That's already their home court");
  await c.env.DB.batch([
    c.env.DB.prepare("DELETE FROM user_courts WHERE user_id = ? AND (role = 'home' OR court_id = ?)").bind(id, court.id), // drop old home, and the new one if it was a secondary
    c.env.DB.prepare("INSERT INTO user_courts (user_id,court_id,role,position) VALUES (?,?,'home',0)").bind(id, court.id),
  ]);
  await notify(c.env, (p) => c.executionCtx.waitUntil(p), [id],
    `An admin changed your home court to ${court.name}. You can change it again from your profile.`, { subject: "Your home court was updated" });
  return c.json({ ok: true });
});

/** Deletes the account: login and personal details go; the name stays on past matches so opponents' records stay correct. */
admin.delete("/users/:id", async (c) => {
  const me = c.get("user"), id = c.req.param("id");
  if (id === me.id) throw bad("You can't delete your own account here");
  const u = await c.env.DB.prepare("SELECT photo_key FROM users WHERE id = ?").bind(id).first<{ photo_key: string | null }>();
  if (!u) throw new HttpError(404, "Player not found");
  if (u.photo_key) await c.env.PHOTOS.delete(u.photo_key);
  await c.env.DB.batch([
    c.env.DB.prepare(`UPDATE users SET status = 'deleted', email = 'deleted+' || id || '@deleted.invalid', whatsapp = NULL, dob = NULL,
      height_cm = NULL, photo_key = NULL, pass_hash = '', pass_salt = '' WHERE id = ?`).bind(id),
    c.env.DB.prepare("DELETE FROM sessions WHERE user_id = ?").bind(id),
    c.env.DB.prepare("DELETE FROM favourites WHERE user_id = ? OR fav_id = ?").bind(id, id),
    c.env.DB.prepare("DELETE FROM user_courts WHERE user_id = ?").bind(id),
    // Their pending scores can no longer be answered fairly, so close them.
    c.env.DB.prepare("UPDATE matches SET status = 'rejected', resolved_at = ? WHERE status = 'pending' AND id IN (SELECT match_id FROM match_players WHERE user_id = ?)").bind(now(), id),
  ]);
  return c.json({ ok: true });
});

/* ---------- photo moderation ---------- */

admin.get("/photos", async (c) => {
  const { results } = await c.env.DB.prepare("SELECT id, pid, first_name AS first, last_name AS last, photo_key FROM users WHERE photo_key IS NOT NULL AND status != 'deleted' ORDER BY first_name").all<any>();
  return c.json(results.map((r) => ({ id: r.id, pid: r.pid, first: r.first, last: r.last, photoUrl: photoUrl(r.photo_key) })));
});

admin.delete("/users/:id/photo", async (c) => {
  const id = c.req.param("id");
  const u = await c.env.DB.prepare("SELECT photo_key FROM users WHERE id = ?").bind(id).first<{ photo_key: string | null }>();
  if (!u?.photo_key) throw bad("This player has no photo");
  await c.env.PHOTOS.delete(u.photo_key);
  await c.env.DB.prepare("UPDATE users SET photo_key = NULL WHERE id = ?").bind(id).run();
  await notify(c.env, (p) => c.executionCtx.waitUntil(p), [id],
    "An admin removed your profile photo because it didn't meet our guidelines. You can upload another or pick an avatar.", { subject: "Your profile photo was removed" });
  return c.json({ ok: true });
});

/* ---------- matches (view only) ---------- */

const MATCH_STATUSES = ["confirmed", "pending", "rejected", "expired"] as const;

/** Builds the shared WHERE clause for the admin match list from the query string (everything except status). */
function matchFilters(q: (k: string) => string | undefined) {
  const where: string[] = [];
  const binds: unknown[] = [];
  const search = (q("q") ?? "").trim();
  if (search) {
    where.push(`EXISTS (SELECT 1 FROM match_players sp JOIN users su ON su.id = sp.user_id WHERE sp.match_id = m.id
      AND (su.first_name || ' ' || su.last_name LIKE ? OR su.pid LIKE ?))`);
    binds.push(`%${search}%`, `${search.toUpperCase()}%`);
  }
  const from = q("from"), to = q("to");
  if (from) { if (!isISODate(from)) throw bad("Bad from date"); where.push("m.match_date >= ?"); binds.push(from); }
  if (to) { if (!isISODate(to)) throw bad("Bad to date"); where.push("m.match_date <= ?"); binds.push(to); }
  const court = q("court");
  if (court) { where.push("m.court_id = ?"); binds.push(court); }
  const type = q("type");
  if (type) { if (type !== "singles" && type !== "doubles") throw bad("Bad match type"); where.push("m.type = ?"); binds.push(type); }
  return { where, binds };
}

/** Every match, newest first, with filters and per-status totals for the same filters. */
admin.get("/matches", async (c) => {
  const q = (k: string) => c.req.query(k) || undefined;
  const { where, binds } = matchFilters(q);
  const status = q("status");
  if (status && !(MATCH_STATUSES as readonly string[]).includes(status)) throw bad("Bad status");
  const limit = Math.min(100, Math.max(1, parseInt(q("limit") ?? "30", 10) || 30));
  const offset = Math.max(0, parseInt(q("offset") ?? "0", 10) || 0);

  const base = where.length ? "WHERE " + where.join(" AND ") : "";
  const { results: counts } = await c.env.DB.prepare(`SELECT m.status AS s, COUNT(*) AS n FROM matches m ${base} GROUP BY m.status`)
    .bind(...binds).all<{ s: string; n: number }>();
  const totals = { all: 0, confirmed: 0, pending: 0, rejected: 0, expired: 0 } as Record<string, number>;
  for (const r of counts) { totals[r.s] = r.n; totals.all += r.n; }

  const listWhere = status ? [...where, "m.status = ?"] : where;
  const listBinds = status ? [...binds, status] : binds;
  const items = await loadMatches(c.env, listWhere.length ? "WHERE " + listWhere.join(" AND ") : "", listBinds,
    `ORDER BY m.match_date DESC, m.submitted_at DESC LIMIT ${limit + 1} OFFSET ${offset}`);
  const more = items.length > limit;
  return c.json({ items: items.slice(0, limit), totals, next: more ? offset + limit : null });
});

/** One match with who submitted and who settled it. */
admin.get("/matches/:id", async (c) => {
  const [m] = await loadMatches(c.env, "WHERE m.id = ?", [c.req.param("id")]);
  if (!m) throw new HttpError(404, "Match not found");
  const row = await c.env.DB.prepare("SELECT resolved_by FROM matches WHERE id = ?").bind(m.id).first<{ resolved_by: string | null }>();
  const who = async (id: string | null) => id
    ? await c.env.DB.prepare("SELECT id, first_name AS first, last_name AS last, pid, status FROM users WHERE id = ?").bind(id).first()
    : null;
  return c.json({ ...m, submitter: await who(m.submittedBy), resolver: await who(row?.resolved_by ?? null) });
});

/** Deletes any match (any status). Everyone in it is told by inbox + email, with the admin's reason if given. */
admin.post("/matches/:id/delete", async (c) => {
  const [m] = await loadMatches(c.env, "WHERE m.id = ?", [c.req.param("id")]);
  if (!m) throw new HttpError(404, "Match not found");
  const b = await c.req.json().catch(() => ({}));
  const reason = str(b.reason, 300).replace(/\s+/g, " ").trim();
  await c.env.DB.batch([
    c.env.DB.prepare("UPDATE notifications SET match_id = NULL WHERE match_id = ?").bind(m.id),
    c.env.DB.prepare("DELETE FROM match_players WHERE match_id = ?").bind(m.id),
    c.env.DB.prepare("DELETE FROM matches WHERE id = ?").bind(m.id),
  ]);
  const names = (ps: { first: string }[]) => ps.map((p) => p.first).join(" & ");
  const date = new Date(m.date + "T12:00:00Z").toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "UTC" });
  const counted = m.status === "confirmed" ? " It no longer counts on your record." : "";
  const why = reason ? ` Reason: ${reason.replace(/[.!?]?$/, ".")}` : "";
  const wu = (p: Promise<unknown>) => c.executionCtx.waitUntil(p);
  // each side reads the match from their own point of view
  for (const [mine, theirs, from] of [[m.teamA, m.teamB, "A"], [m.teamB, m.teamA, "B"]] as const) {
    await notify(c.env, wu, mine.map((p) => p.id),
      `An admin removed your match from ${date} vs ${names(theirs)} (${scoreLine(m.sets, from)}).${counted}${why}`,
      { subject: "A match was removed" });
  }
  return c.json({ ok: true });
});

/* ---------- home dashboard ---------- */

const DAY_MS = 86400_000;
const PENDING_DAYS = 7;
// a timestamp (ms) as a Lagos calendar date, in SQL
const lagosDay = (col: string) => `date(${col} / 1000 + 3600, 'unixepoch')`;

/** Everything the admin Home tab shows, in one request. */
admin.get("/stats", async (c) => {
  const db = c.env.DB;
  const t = Date.now();
  const today = lagosToday();
  const start14 = addDaysISO(today, -13);
  const start30 = addDaysISO(today, -29);
  const PLAYER = "status IN ('active','suspended')"; // finished sign-up and not deleted

  const [players, gender, courts, newByDay, before, wap, wapPrev, matchesByDay, funnel, topCourts, topPlayers, courtQueue, expiring] = await Promise.all([
    db.prepare(`SELECT COUNT(*) AS n FROM users WHERE ${PLAYER}`).first<{ n: number }>(),
    db.prepare(`SELECT COALESCE(gender, 'Not set') AS g, COUNT(*) AS n FROM users WHERE ${PLAYER} GROUP BY g`).all<{ g: string; n: number }>(),
    db.prepare(`SELECT COUNT(DISTINCT uc.court_id) AS n FROM user_courts uc JOIN courts ct ON ct.id = uc.court_id JOIN users u ON u.id = uc.user_id
      WHERE ct.status = 'approved' AND u.${PLAYER}`).first<{ n: number }>(),
    db.prepare(`SELECT ${lagosDay("created_at")} AS d, COUNT(*) AS n FROM users WHERE ${PLAYER} AND ${lagosDay("created_at")} >= ? GROUP BY d`).bind(start14).all<{ d: string; n: number }>(),
    db.prepare(`SELECT COUNT(*) AS n FROM users WHERE ${PLAYER} AND ${lagosDay("created_at")} < ?`).bind(start14).first<{ n: number }>(),
    activePlayers(db, t - 7 * DAY_MS, t, addDaysISO(today, -6), today),
    activePlayers(db, t - 14 * DAY_MS, t - 7 * DAY_MS, addDaysISO(today, -13), addDaysISO(today, -7)),
    db.prepare(`SELECT ${lagosDay("submitted_at")} AS d, type, COUNT(*) AS n FROM matches WHERE ${lagosDay("submitted_at")} >= ? GROUP BY d, type`).bind(start14).all<{ d: string; type: string; n: number }>(),
    db.prepare(`SELECT COUNT(*) AS signedUp, SUM(email_verified) AS verified, SUM(status IN ('active','suspended')) AS onboarded,
      SUM(status IN ('active','suspended') AND EXISTS (SELECT 1 FROM match_players mp JOIN matches m ON m.id = mp.match_id WHERE mp.user_id = users.id AND m.status = 'confirmed')) AS played
      FROM users WHERE status != 'deleted'`).first<{ signedUp: number; verified: number; onboarded: number; played: number }>(),
    db.prepare(`SELECT ct.id, ct.name, COUNT(*) AS n FROM matches m JOIN courts ct ON ct.id = m.court_id
      WHERE m.status = 'confirmed' AND m.match_date >= ? GROUP BY ct.id ORDER BY n DESC, ct.name LIMIT 5`).bind(start30).all(),
    db.prepare(`SELECT u.id, u.first_name AS first, u.last_name AS last, COUNT(*) AS n FROM match_players mp JOIN matches m ON m.id = mp.match_id JOIN users u ON u.id = mp.user_id
      WHERE m.status = 'confirmed' AND m.match_date >= ? AND u.status != 'deleted' GROUP BY u.id ORDER BY n DESC, u.first_name LIMIT 5`).bind(start30).all(),
    db.prepare(`SELECT id, name FROM courts WHERE status = 'pending' ORDER BY rowid LIMIT 5`).all(),
    db.prepare(`SELECT id, submitted_at AS submittedAt, match_date AS date FROM matches WHERE status = 'pending' AND submitted_at <= ? ORDER BY submitted_at LIMIT 5`)
      .bind(t - (PENDING_DAYS - 2) * DAY_MS).all<{ id: string; submittedAt: number; date: string }>(),
  ]);
  const courtQueueCount = await db.prepare("SELECT COUNT(*) AS n FROM courts WHERE status = 'pending'").first<{ n: number }>();

  // fill every day in the 14-day window, even days with nothing
  const days = Array.from({ length: 14 }, (_, i) => addDaysISO(start14, i));
  let running = before?.n ?? 0;
  const growth = days.map((d) => {
    const n = newByDay.results.find((r) => r.d === d)?.n ?? 0;
    running += n;
    return { date: d, added: n, total: running };
  });
  const matchesDaily = days.map((d) => ({
    date: d,
    singles: matchesByDay.results.find((r) => r.d === d && r.type === "singles")?.n ?? 0,
    doubles: matchesByDay.results.find((r) => r.d === d && r.type === "doubles")?.n ?? 0,
  }));
  const expiringMatches = expiring.results.length ? await loadMatches(c.env, `WHERE m.id IN (${expiring.results.map(() => "?").join(",")})`, expiring.results.map((r) => r.id), "ORDER BY m.submitted_at") : [];

  return c.json({
    today,
    players: players?.n ?? 0,
    activeCourts: courts?.n ?? 0,
    gender: Object.fromEntries(gender.results.map((r) => [r.g, r.n])),
    growth,
    weeklyActive: { now: wap, before: wapPrev },
    matchesDaily,
    funnel: { signedUp: funnel?.signedUp ?? 0, verified: funnel?.verified ?? 0, onboarded: funnel?.onboarded ?? 0, played: funnel?.played ?? 0 },
    topCourts: topCourts.results,
    topPlayers: topPlayers.results,
    attention: {
      courts: courtQueue.results, courtsWaiting: courtQueueCount?.n ?? 0,
      expiring: expiringMatches.map((m) => ({ ...m, expiresAt: m.submittedAt + PENDING_DAYS * DAY_MS })),
    },
  });
});

/** Players who logged a score (any outcome) or played a confirmed match in a window. */
async function activePlayers(db: D1Database, fromMs: number, toMs: number, fromDate: string, toDate: string): Promise<number> {
  const r = await db.prepare(`SELECT COUNT(DISTINCT mp.user_id) AS n FROM match_players mp JOIN matches m ON m.id = mp.match_id JOIN users u ON u.id = mp.user_id
    WHERE u.status != 'deleted' AND ((m.submitted_at >= ? AND m.submitted_at < ?) OR (m.status = 'confirmed' AND m.match_date BETWEEN ? AND ?))`)
    .bind(fromMs, toMs, fromDate, toDate).first<{ n: number }>();
  return r?.n ?? 0;
}
