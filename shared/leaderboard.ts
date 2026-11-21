/**
 * Players tab scoring ("show-up points"), for one calendar season:
 *   singles win 3, singles loss 1, doubles win 2 (each), doubles loss 1 (each).
 * Only confirmed matches count. Only a player's first 3 matches in a calendar month against the
 * same opponent (or the same doubles pair) earn points; the rest still count as wins and losses.
 * Ties: more wins first, then the most recent win, then name.
 */
export interface LbMatch { id: string; date: string; type: "singles" | "doubles"; winner: "A" | "B"; players: Array<{ id: string; side: "A" | "B" }> }
export interface LbScore { id: string; pts: number; won: number; lost: number; lastWin: string | null }

export const POINTS = { singles: { win: 3, loss: 1 }, doubles: { win: 2, loss: 1 } } as const;
export const SAME_OPPONENT_MONTHLY_CAP = 3;

/** `matches` must be in the order they were played. */
export function scoreSeason(matches: LbMatch[], season: string): Map<string, LbScore> {
  const out = new Map<string, LbScore>();
  const seen = new Map<string, number>();
  for (const m of matches) {
    if (!m.date.startsWith(season)) continue;
    for (const p of m.players) {
      const s = out.get(p.id) ?? { id: p.id, pts: 0, won: 0, lost: 0, lastWin: null };
      const won = p.side === m.winner;
      if (won) { s.won++; if (!s.lastWin || m.date > s.lastWin) s.lastWin = m.date; } else s.lost++;
      const opp = m.players.filter((q) => q.side !== p.side).map((q) => q.id).sort().join("+");
      const key = `${p.id}|${m.date.slice(0, 7)}|${opp}`;
      const n = (seen.get(key) ?? 0) + 1;
      seen.set(key, n);
      if (n <= SAME_OPPONENT_MONTHLY_CAP) s.pts += won ? POINTS[m.type].win : POINTS[m.type].loss;
      out.set(p.id, s);
    }
  }
  return out;
}

export function compareScores(a: LbScore & { name: string }, b: LbScore & { name: string }) {
  return b.pts - a.pts || b.won - a.won || (b.lastWin ?? "").localeCompare(a.lastWin ?? "") || a.name.localeCompare(b.name);
}
