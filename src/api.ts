import type { FormatKey, SetScore, Side } from "../shared/rules";

export interface PublicUser {
  id: string; pid: string; first: string; last: string; nationality: string | null;
  hand: string | null; backhand: string | null; shot: string | null; avatar: number; photoUrl: string | null;
  homeCourt?: string | null;
}
export interface CourtRef { id: string; name: string; area: string | null; status: string; role?: string; state?: string; address?: string | null; players?: number }
export interface Racquet { brand: string; model: string; custom: boolean; primary: boolean }
export interface Me extends PublicUser {
  email: string; status: "onboarding" | "active" | "suspended"; isAdmin: boolean; gender: string | null; dob: string | null;
  whatsapp: string | null; heightCm: number | null; heightUnit: "metric" | "imperial";
  courts: CourtRef[]; racquets: Racquet[]; unread: number; favourites: string[];
}
export interface Match {
  id: string; type: "singles" | "doubles"; date: string; format: FormatKey; sets: SetScore[]; winner: Side;
  status: "pending" | "confirmed" | "rejected" | "expired"; court: { id: string; name: string } | null;
  submittedBy: string; submittedAt: number; resolvedAt: number | null; teamA: PublicUser[]; teamB: PublicUser[]; expiresAt?: number;
}
export interface PlayerProfile extends PublicUser {
  courts: CourtRef[]; racquets: Racquet[]; record: { played: number; won: number; lost: number; form: string[] };
  isFavourite: boolean; activity: { days: Record<string, number>; since: string }; h2h: { played: number; myWins: number; matches: Match[] };
}
export interface Notification { id: string; text: string; matchId: string | null; at: number; readAt: number | null }

export class ApiError extends Error {
  constructor(public status: number, message: string, public data?: any) { super(message); }
}

async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  const init: RequestInit = { method, credentials: "same-origin", headers: {} };
  if (body instanceof FormData) init.body = body;
  else if (body !== undefined) { init.body = JSON.stringify(body); (init.headers as any)["Content-Type"] = "application/json"; }
  let res: Response;
  try { res = await fetch("/api" + path, init); }
  catch { throw new ApiError(0, "Can't reach 30-All. Check your connection."); }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new ApiError(res.status, data.error || "Something went wrong", data);
  return data as T;
}

export const api = {
  get: <T>(p: string) => request<T>("GET", p),
  post: <T>(p: string, b?: unknown) => request<T>("POST", p, b ?? {}),
  put: <T>(p: string, b?: unknown) => request<T>("PUT", p, b ?? {}),
  patch: <T>(p: string, b?: unknown) => request<T>("PATCH", p, b ?? {}),
  del: <T>(p: string) => request<T>("DELETE", p),
};
