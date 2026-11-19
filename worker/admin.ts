import { Hono } from "hono";
import { STATES } from "../shared/data";
import { ageOn, isISODate, MIN_AGE } from "../shared/rules";
import { requireUser } from "./auth";
import { bad, HttpError, newId, now, str, type AppEnv } from "./lib";
import { notify } from "./notify";
import { photoUrl, recordFor, userCourts, userRacquets } from "./queries";

export const admin = new Hono<AppEnv>();
admin.use("*", requireUser({ admin: true }));

/* ---------- courts ---------- */

admin.get("/courts", async (c) => {
  const { results } = await c.env.DB.prepare(
    `SELECT c.*, u.first_name || ' ' || u.last_name AS submitter,
       (SELECT COUNT(*) FROM user_courts uc WHERE uc.court_id = c.id) AS players
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

/** Edit a court's details (e.g. tidy a submitted name before approving). */
admin.put("/courts/:id", async (c) => {
  const b = await c.req.json().catch(() => ({}));
  const name = str(b.name, 100);
  if (!name) throw bad("Court name can't be empty");
  await c.env.DB.prepare("UPDATE courts SET name = ?, area = ?, address = ? WHERE id = ?")
    .bind(name, str(b.area, 100) || null, str(b.address, 200) || null, c.req.param("id")).run();
  return c.json({ ok: true });
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
  const { results: rows } = await c.env.DB.prepare("SELECT user_id, role, position FROM user_courts WHERE court_id = ?").bind(ct.id).all<{ user_id: string; role: string; position: number }>();
  const stmts: D1PreparedStatement[] = [];
  for (const r of rows) {
    const has = await c.env.DB.prepare("SELECT role FROM user_courts WHERE user_id = ? AND court_id = ?").bind(r.user_id, into.id).first<{ role: string }>();
    stmts.push(c.env.DB.prepare("DELETE FROM user_courts WHERE user_id = ? AND court_id = ?").bind(r.user_id, ct.id));
    if (!has) stmts.push(c.env.DB.prepare("INSERT INTO user_courts (user_id,court_id,role,position) VALUES (?,?,?,?)").bind(r.user_id, into.id, r.role, r.position));
    else if (r.role === "home" && has.role !== "home") stmts.push(c.env.DB.prepare("UPDATE user_courts SET role = 'home', position = 0 WHERE user_id = ? AND court_id = ?").bind(r.user_id, into.id));
  }
  stmts.push(c.env.DB.prepare("UPDATE matches SET court_id = ? WHERE court_id = ?").bind(into.id, ct.id));
  stmts.push(c.env.DB.prepare("UPDATE courts SET status = 'merged', merged_into = ? WHERE id = ?").bind(into.id, ct.id));
  await c.env.DB.batch(stmts);
  const ids = [...new Set([ct.submitted_by, ...rows.map((r) => r.user_id)].filter(Boolean) as string[])];
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
