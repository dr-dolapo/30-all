import type { SetScore, Side } from "../shared/rules";
import type { Env, UserRow } from "./lib";

export interface PublicUser {
  id: string; pid: string; first: string; last: string; nationality: string | null;
  hand: string | null; backhand: string | null; shot: string | null; avatar: number; photoUrl: string | null;
}

export const photoUrl = (key: string | null) => (key ? `/api/photos/${encodeURIComponent(key)}` : null);

export function publicUser(u: Pick<UserRow, "id" | "pid" | "first_name" | "last_name" | "nationality" | "hand" | "backhand" | "fav_shot" | "avatar" | "photo_key">): PublicUser {
  return {
    id: u.id, pid: u.pid, first: u.first_name, last: u.last_name, nationality: u.nationality,
    hand: u.hand, backhand: u.backhand, shot: u.fav_shot, avatar: u.avatar, photoUrl: photoUrl(u.photo_key),
  };
}

export const PUBLIC_COLS = "u.id, u.pid, u.first_name, u.last_name, u.nationality, u.hand, u.backhand, u.fav_shot, u.avatar, u.photo_key";

export interface MatchOut {
  id: string; type: string; date: string; format: string; sets: SetScore[]; winner: Side; status: string;
  court: { id: string; name: string } | null; submittedBy: string; submittedAt: number; resolvedAt: number | null;
  teamA: PublicUser[]; teamB: PublicUser[];
}

interface MatchRow {
  id: string; type: string; match_date: string; court_id: string | null; court_name: string | null; format: string;
  sets_json: string; winner_side: Side; status: string; submitted_by: string; submitted_at: number; resolved_at: number | null;
}

/** Loads matches by a WHERE clause on table `m` (and optional joins), with their players attached. */
export async function loadMatches(env: Env, where: string, binds: unknown[], orderLimit = "ORDER BY m.match_date DESC, m.submitted_at DESC LIMIT 300"): Promise<MatchOut[]> {
  const { results: rows } = await env.DB.prepare(
    `SELECT DISTINCT m.*, c.name AS court_name FROM matches m LEFT JOIN courts c ON c.id = m.court_id ${where} ${orderLimit}`,
  ).bind(...binds).all<MatchRow>();
  if (!rows.length) return [];
  const ids = rows.map((r) => r.id);
  const players: Array<{ match_id: string; side: Side } & UserRow> = [];
  for (let i = 0; i < ids.length; i += 90) { // stay under D1's bound-parameter limit
    const chunk = ids.slice(i, i + 90);
    const { results } = await env.DB.prepare(
      `SELECT mp.match_id, mp.side, ${PUBLIC_COLS} FROM match_players mp JOIN users u ON u.id = mp.user_id WHERE mp.match_id IN (${chunk.map(() => "?").join(",")})`,
    ).bind(...chunk).all<{ match_id: string; side: Side } & UserRow>();
    players.push(...results);
  }
  return rows.map((r) => ({
    id: r.id, type: r.type, date: r.match_date, format: r.format, sets: JSON.parse(r.sets_json), winner: r.winner_side, status: r.status,
    court: r.court_id ? { id: r.court_id, name: r.court_name ?? "" } : null,
    submittedBy: r.submitted_by, submittedAt: r.submitted_at, resolvedAt: r.resolved_at,
    teamA: players.filter((p) => p.match_id === r.id && p.side === "A").map(publicUser),
    teamB: players.filter((p) => p.match_id === r.id && p.side === "B").map(publicUser),
  }));
}

export function sideOf(m: MatchOut, userId: string): Side | null {
  if (m.teamA.some((p) => p.id === userId)) return "A";
  if (m.teamB.some((p) => p.id === userId)) return "B";
  return null;
}

export async function recordFor(env: Env, userId: string) {
  const ms = await loadMatches(env, "JOIN match_players me ON me.match_id = m.id WHERE m.status = 'confirmed' AND me.user_id = ?", [userId], "ORDER BY m.match_date DESC, m.submitted_at DESC LIMIT 1000");
  const won = ms.filter((m) => m.winner === sideOf(m, userId)).length;
  return { played: ms.length, won, lost: ms.length - won, form: ms.slice(0, 5).map((m) => (m.winner === sideOf(m, userId) ? "W" : "L")), matches: ms };
}

export interface CourtRef { id: string; name: string; area: string | null; state: string; status: string; role: string }

export async function userCourts(env: Env, userId: string): Promise<CourtRef[]> {
  const { results } = await env.DB.prepare(
    "SELECT c.id, c.name, c.area, c.state, c.status, uc.role FROM user_courts uc JOIN courts c ON c.id = uc.court_id WHERE uc.user_id = ? ORDER BY uc.role = 'home' DESC, uc.position",
  ).bind(userId).all<CourtRef>();
  return results;
}

export async function userRacquets(env: Env, userId: string) {
  const { results } = await env.DB.prepare("SELECT brand, model, is_custom, is_primary FROM user_racquets WHERE user_id = ? ORDER BY is_primary DESC, position").bind(userId).all<{ brand: string; model: string; is_custom: number; is_primary: number }>();
  return results.map((r) => ({ brand: r.brand, model: r.model, custom: !!r.is_custom, primary: !!r.is_primary }));
}
