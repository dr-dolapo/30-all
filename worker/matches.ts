import { Hono } from "hono";
import { evalScore, FORMATS, isISODate, lagosToday, matchDateError, PENDING_DAYS, scoreLine, type FormatKey } from "../shared/rules";
import { requireUser } from "./auth";
import { bad, fullName, HttpError, newId, now, str, type AppEnv, type Env } from "./lib";
import { notify } from "./notify";
import { loadMatches, type MatchOut } from "./queries";

export const matches = new Hono<AppEnv>();

const DAY = 86400_000;
const firstNames = (ps: { first: string }[]) => ps.map((p) => p.first).join(" & ");
const title = (m: MatchOut) => `${firstNames(m.teamA)} vs ${firstNames(m.teamB)}`;
const allIds = (m: MatchOut) => [...m.teamA, ...m.teamB].map((p) => p.id);
const shortDate = (iso: string) => new Date(iso + "T12:00:00Z").toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "UTC" });

/** Confirmed matches for a month (YYYY-MM), with optional filters: mine=1, player=<id>, court=<id>. */
matches.get("/matches", requireUser(), async (c) => {
  const me = c.get("user");
  const month = c.req.query("month") ?? lagosToday().slice(0, 7);
  if (!/^\d{4}-\d{2}$/.test(month)) throw bad("Bad month");
  const where = ["m.status = 'confirmed'", "m.match_date LIKE ?"];
  const binds: unknown[] = [month + "-%"];
  if (c.req.query("mine") === "1") { where.push("EXISTS (SELECT 1 FROM match_players x WHERE x.match_id = m.id AND x.user_id = ?)"); binds.push(me.id); }
  const player = c.req.query("player");
  if (player) { where.push("EXISTS (SELECT 1 FROM match_players y WHERE y.match_id = m.id AND y.user_id = ?)"); binds.push(player); }
  const court = c.req.query("court");
  if (court) { where.push("m.court_id = ?"); binds.push(court); }
  return c.json(await loadMatches(c.env, "WHERE " + where.join(" AND "), binds));
});

/** Confirmed matches on one day. scope=me → only matches I played in; scope=all → everyone's. */
matches.get("/matches/day", requireUser(), async (c) => {
  const me = c.get("user");
  const date = c.req.query("date") ?? "";
  if (!isISODate(date)) throw bad("Bad date");
  const mine = c.req.query("scope") === "me";
  const where = mine
    ? "JOIN match_players me ON me.match_id = m.id WHERE m.status = 'confirmed' AND m.match_date = ? AND me.user_id = ?"
    : "WHERE m.status = 'confirmed' AND m.match_date = ?";
  return c.json(await loadMatches(c.env, where, mine ? [date, me.id] : [date], "ORDER BY m.resolved_at DESC"));
});

/** Dates that have confirmed matches (for the dots on the date strip) and the earliest one (how far back the strip goes). */
matches.get("/matches/days", requireUser(), async (c) => {
  const me = c.get("user");
  const mine = c.req.query("scope") === "me";
  const { results } = mine
    ? await c.env.DB.prepare("SELECT DISTINCT m.match_date AS d FROM matches m JOIN match_players p ON p.match_id = m.id WHERE m.status = 'confirmed' AND p.user_id = ? ORDER BY d").bind(me.id).all<{ d: string }>()
    : await c.env.DB.prepare("SELECT DISTINCT match_date AS d FROM matches WHERE status = 'confirmed' ORDER BY d").all<{ d: string }>();
  const first = await c.env.DB.prepare("SELECT MIN(match_date) AS d FROM matches WHERE status = 'confirmed'").first<{ d: string | null }>();
  return c.json({ first: first?.d ?? null, days: results.map((r) => r.d) });
});

/** My pending matches: ones I must answer, and ones waiting on my opponents. */
matches.get("/matches/pending", requireUser(), async (c) => {
  const me = c.get("user");
  await expirePending(c.env, (p) => c.executionCtx.waitUntil(p)); // keep the list honest even between cron runs
  const ms = await loadMatches(c.env, "JOIN match_players me ON me.match_id = m.id WHERE m.status = 'pending' AND me.user_id = ?", [me.id], "ORDER BY m.submitted_at ASC");
  return c.json(ms.map((m) => ({ ...m, expiresAt: m.submittedAt + PENDING_DAYS * DAY })));
});

matches.post("/matches", requireUser(), async (c) => {
  const me = c.get("user");
  const b = await c.req.json().catch(() => ({}));
  const type = b.type === "doubles" ? "doubles" : b.type === "singles" ? "singles" : null;
  if (!type) throw bad("Choose singles or doubles");
  const format = b.format as FormatKey;
  if (!(format in FORMATS)) throw bad("Choose a match format");
  const dateErr = matchDateError(b.date, lagosToday());
  if (dateErr) throw bad(dateErr);

  const courtId = str(b.courtId, 64);
  // any approved court, or a court the submitter added to their profile that's still awaiting approval
  const court = await c.env.DB.prepare(
    `SELECT ct.id FROM courts ct WHERE ct.id = ?1 AND (ct.status = 'approved'
       OR (ct.status = 'pending' AND EXISTS (SELECT 1 FROM user_courts uc WHERE uc.court_id = ct.id AND uc.user_id = ?2)))`).bind(courtId, me.id).first();
  if (!court) throw bad("Choose a court");

  const partner = type === "doubles" ? str(b.partner, 64) : "";
  const opponents: string[] = Array.isArray(b.opponents) ? b.opponents.map((x: unknown) => str(x, 64)).filter(Boolean) : [];
  if (type === "singles" && opponents.length !== 1) throw bad("Choose your opponent");
  if (type === "doubles" && (!partner || opponents.length !== 2)) throw bad("Choose your partner and both opponents");
  const others = [partner, ...opponents].filter(Boolean);
  if (new Set([me.id, ...others]).size !== others.length + 1) throw bad("Each player can only appear once");
  const { results: found } = await c.env.DB.prepare(`SELECT id FROM users WHERE status = 'active' AND id IN (${others.map(() => "?").join(",")})`).bind(...others).all<{ id: string }>();
  if (found.length !== others.length) throw bad("Only registered players can be added");

  const raw = Array.isArray(b.sets) ? b.sets.slice(0, 3).map((s: unknown) => (Array.isArray(s) ? [s[0] ?? "", s[1] ?? ""] : ["", ""])) : [];
  const score = evalScore(format, raw as Array<[string, string]>);
  if (score.error) throw bad(score.error);
  if (!score.complete || !score.winner) throw bad("Enter the full score");

  const id = newId(), t = now();
  const sideA = [me.id, ...(partner ? [partner] : [])];
  await c.env.DB.batch([
    c.env.DB.prepare("INSERT INTO matches (id,type,match_date,court_id,format,sets_json,winner_side,status,submitted_by,submitted_at) VALUES (?,?,?,?,?,?,?,'pending',?,?)")
      .bind(id, type, b.date, courtId, format, JSON.stringify(score.sets), score.winner, me.id, t),
    ...sideA.map((u) => c.env.DB.prepare("INSERT INTO match_players (match_id,user_id,side) VALUES (?,?,'A')").bind(id, u)),
    ...opponents.map((u) => c.env.DB.prepare("INSERT INTO match_players (match_id,user_id,side) VALUES (?,?,'B')").bind(id, u)),
  ]);

  const wu = (p: Promise<unknown>) => c.executionCtx.waitUntil(p);
  const date = shortDate(b.date);
  await notify(c.env, wu, opponents,
    `${fullName(me)} submitted a score vs you from ${date}: ${scoreLine(score.sets, "B")} (your side first). Open 30-All to accept or reject it within ${PENDING_DAYS} days.`,
    { matchId: id, subject: `${me.first_name} sent you a score to confirm` });
  if (partner) await notify(c.env, wu, [partner],
    `${fullName(me)} submitted your doubles score from ${date}: ${scoreLine(score.sets, "A")}. Waiting for an opponent to accept.`,
    { matchId: id, subject: "Your doubles score was submitted" });
  return c.json({ id });
});

async function getPendingFor(env: Env, id: string): Promise<MatchOut> {
  const [m] = await loadMatches(env, "WHERE m.id = ?", [id]);
  if (!m) throw new HttpError(404, "Match not found");
  if (m.status !== "pending") throw bad(`This score is already ${m.status}`);
  if (now() - m.submittedAt >= PENDING_DAYS * DAY) throw bad("This score has expired");
  return m;
}

for (const action of ["accept", "reject"] as const) {
  matches.post(`/matches/:id/${action}`, requireUser(), async (c) => {
    const me = c.get("user");
    const m = await getPendingFor(c.env, c.req.param("id"));
    if (!m.teamB.some((p) => p.id === me.id)) throw new HttpError(403, "Only an opponent can answer this score");
    const status = action === "accept" ? "confirmed" : "rejected";
    // Guard against a race where two opponents answer at once: only update while still pending.
    const r = await c.env.DB.prepare("UPDATE matches SET status = ?, resolved_at = ?, resolved_by = ? WHERE id = ? AND status = 'pending'").bind(status, now(), me.id, m.id).run();
    if (!r.meta.changes) throw bad("This score was already answered");
    const text = action === "accept"
      ? `${fullName(me)} accepted the score from ${shortDate(m.date)} (${title(m)}: ${scoreLine(m.sets, "A")}). It's now on the record.`
      : `${fullName(me)} rejected the score from ${shortDate(m.date)} (${title(m)}). It won't be recorded; it can be entered again.`;
    await notify(c.env, (p) => c.executionCtx.waitUntil(p), allIds(m).filter((x) => x !== me.id), text,
      { matchId: m.id, subject: action === "accept" ? "Score confirmed" : "Score rejected" });
    return c.json({ ok: true });
  });
}

matches.delete("/matches/:id", requireUser(), async (c) => {
  const me = c.get("user");
  const m = await getPendingFor(c.env, c.req.param("id"));
  if (m.submittedBy !== me.id) throw new HttpError(403, "Only the person who entered this score can delete it");
  await c.env.DB.batch([
    c.env.DB.prepare("DELETE FROM match_players WHERE match_id = ?").bind(m.id),
    c.env.DB.prepare("DELETE FROM matches WHERE id = ? AND status = 'pending'").bind(m.id),
  ]);
  await notify(c.env, (p) => c.executionCtx.waitUntil(p), allIds(m).filter((x) => x !== me.id),
    `${fullName(me)} deleted a pending score from ${shortDate(m.date)} (${title(m)}).`, { email: false });
  return c.json({ ok: true });
});

/** Auto-reject scores nobody accepted within 7 days, and tell everyone involved. Runs hourly (cron) and on demand. */
export async function expirePending(env: Env, waitUntil: (p: Promise<unknown>) => void): Promise<number> {
  const cutoff = now() - PENDING_DAYS * DAY;
  const stale = await loadMatches(env, "WHERE m.status = 'pending' AND m.submitted_at <= ?", [cutoff], "LIMIT 200");
  for (const m of stale) {
    const r = await env.DB.prepare("UPDATE matches SET status = 'expired', resolved_at = ? WHERE id = ? AND status = 'pending'").bind(now(), m.id).run();
    if (!r.meta.changes) continue;
    await notify(env, waitUntil, allIds(m),
      `The score from ${shortDate(m.date)} (${title(m)}: ${scoreLine(m.sets, "A")}) wasn't accepted within ${PENDING_DAYS} days, so it was automatically rejected.`,
      { matchId: m.id, subject: "A score expired" });
  }
  return stale.length;
}
