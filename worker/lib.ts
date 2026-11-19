import type { Context } from "hono";

export interface SendEmailBinding {
  send(msg: { to: string; from: string; subject: string; html?: string; text?: string }): Promise<{ messageId: string }>;
}

export interface Env {
  DB: D1Database;
  PHOTOS: R2Bucket;
  ASSETS: Fetcher;
  EMAIL?: SendEmailBinding;          // Cloudflare Email Service (send_email binding)
  EMAIL_PROVIDER: "console" | "resend" | "cloudflare";
  EMAIL_FROM: string;
  RESEND_API_KEY?: string;
  ADMIN_EMAILS: string;
  APP_URL: string;
}

export interface UserRow {
  id: string; pid: string; first_name: string; last_name: string; email: string;
  pass_hash: string; pass_salt: string; email_verified: number; status: string; is_admin: number;
  gender: string | null; dob: string | null; nationality: string | null; whatsapp: string | null;
  height_cm: number | null; height_unit: string; hand: string | null; backhand: string | null;
  fav_shot: string | null; avatar: number; photo_key: string | null; created_at: number;
}

export type AppEnv = { Bindings: Env; Variables: { user: UserRow } };
export type Ctx = Context<AppEnv>;

export const now = () => Date.now();
export const newId = () => crypto.randomUUID();

export class HttpError extends Error {
  constructor(public status: number, message: string) { super(message); }
}
export const bad = (msg: string) => new HttpError(400, msg);

const enc = new TextEncoder();
const toHex = (buf: ArrayBuffer) => [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
const toB64url = (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");

export async function sha256(s: string): Promise<string> {
  return toHex(await crypto.subtle.digest("SHA-256", enc.encode(s)));
}

export function randomToken(bytes = 32): string {
  const b = new Uint8Array(bytes);
  crypto.getRandomValues(b);
  return toB64url(b);
}

export function randomCode(): string {
  const b = new Uint32Array(1);
  crypto.getRandomValues(b);
  return String(b[0] % 1_000_000).padStart(6, "0");
}

/** PBKDF2-SHA256, 100k iterations (the Workers maximum). */
export async function hashPassword(password: string, saltHex?: string): Promise<{ hash: string; salt: string }> {
  const salt = saltHex ?? toHex(crypto.getRandomValues(new Uint8Array(16)).buffer as ArrayBuffer);
  const key = await crypto.subtle.importKey("raw", enc.encode(password), "PBKDF2", false, ["deriveBits"]);
  const saltBytes = new Uint8Array(salt.match(/../g)!.map((h) => parseInt(h, 16)));
  const bits = await crypto.subtle.deriveBits({ name: "PBKDF2", hash: "SHA-256", salt: saltBytes, iterations: 100_000 }, key, 256);
  return { hash: toHex(bits), salt };
}

export function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let r = 0;
  for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return r === 0;
}

export const fullName = (u: { first_name: string; last_name: string }) => `${u.first_name} ${u.last_name}`;

export const isAdminEmail = (env: Env, email: string) =>
  env.ADMIN_EMAILS.split(",").map((e) => e.trim().toLowerCase()).filter(Boolean).includes(email.toLowerCase());

export function str(v: unknown, max = 200): string {
  return typeof v === "string" ? v.trim().slice(0, max) : "";
}
