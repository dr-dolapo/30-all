import { Hono, type MiddlewareHandler } from "hono";
import { deleteCookie, getCookie, setCookie } from "hono/cookie";
import { idPrefix, randomSixDigits } from "../shared/rules";
import { sendMail } from "./email";
import {
  bad, hashPassword, HttpError, isAdminEmail, newId, now, randomCode, randomToken, sha256, str, timingSafeEqual,
  type AppEnv, type Ctx, type Env, type UserRow,
} from "./lib";

const SESSION_DAYS = 30;
const CODE_TTL = 10 * 60_000;      // codes expire after 10 minutes
const RESEND_AFTER = 60_000;       // a new code can be requested after 60 seconds
const MAX_ATTEMPTS = 5;
const COOKIE = "sid";

/* ---------- sessions ---------- */

async function createSession(c: Ctx, userId: string) {
  const token = randomToken();
  await c.env.DB.prepare("INSERT INTO sessions (token_hash,user_id,expires_at) VALUES (?,?,?)")
    .bind(await sha256(token), userId, now() + SESSION_DAYS * 86400_000).run();
  setCookie(c, COOKIE, token, {
    httpOnly: true, secure: new URL(c.req.url).protocol === "https:", sameSite: "Lax", path: "/", maxAge: SESSION_DAYS * 86400,
  });
}

export async function loadUser(c: Ctx): Promise<UserRow | null> {
  const token = getCookie(c, COOKIE);
  if (!token) return null;
  const row = await c.env.DB.prepare(
    "SELECT u.* FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.token_hash = ? AND s.expires_at > ?",
  ).bind(await sha256(token), now()).first<UserRow>();
  return row ?? null;
}

/** Requires a logged-in, verified user. `allowOnboarding` lets users who haven't finished sign-up through. */
export const requireUser = (opts: { allowOnboarding?: boolean; admin?: boolean } = {}): MiddlewareHandler<AppEnv> => async (c, next) => {
  const u = await loadUser(c);
  if (!u || !u.email_verified || u.status === "deleted") throw new HttpError(401, "Please log in");
  if (u.status === "suspended") throw new HttpError(403, "This account has been suspended. Contact an admin.");
  if (u.status === "onboarding" && !opts.allowOnboarding) throw new HttpError(403, "Finish setting up your profile first");
  if (opts.admin && !u.is_admin) throw new HttpError(403, "Admins only");
  c.set("user", u);
  await next();
};

/* ---------- email codes ---------- */

async function issueCode(env: Env, email: string, purpose: "verify" | "reset", waitUntil: (p: Promise<unknown>) => void) {
  const existing = await env.DB.prepare("SELECT sent_at FROM email_codes WHERE email = ? AND purpose = ?").bind(email, purpose).first<{ sent_at: number }>();
  if (existing && now() - existing.sent_at < RESEND_AFTER) {
    const wait = Math.ceil((RESEND_AFTER - (now() - existing.sent_at)) / 1000);
    throw new HttpError(429, `Please wait ${wait}s before requesting a new code`);
  }
  const code = randomCode();
  await env.DB.prepare(
    "INSERT INTO email_codes (email,purpose,code_hash,expires_at,attempts,sent_at) VALUES (?,?,?,?,0,?) " +
    "ON CONFLICT(email,purpose) DO UPDATE SET code_hash=excluded.code_hash, expires_at=excluded.expires_at, attempts=0, sent_at=excluded.sent_at",
  ).bind(email, purpose, await sha256(`${email.toLowerCase()}:${code}`), now() + CODE_TTL, now()).run();
  const text = purpose === "verify"
    ? `Your 30-All verification code is ${code}. It expires in 10 minutes.`
    : `Your 30-All password reset code is ${code}. It expires in 10 minutes. If you didn't ask for this, ignore this email.`;
  waitUntil(sendMail(env, { to: email, subject: purpose === "verify" ? `${code} is your 30-All code` : "Reset your 30-All password", text }));
}

async function checkCode(env: Env, email: string, purpose: "verify" | "reset", code: string) {
  const row = await env.DB.prepare("SELECT * FROM email_codes WHERE email = ? AND purpose = ?").bind(email, purpose)
    .first<{ code_hash: string; expires_at: number; attempts: number }>();
  if (!row) throw bad("Request a new code");
  if (row.expires_at < now()) throw bad("That code has expired. Request a new one.");
  if (row.attempts >= MAX_ATTEMPTS) throw bad("Too many wrong attempts. Request a new code.");
  const ok = timingSafeEqual(row.code_hash, await sha256(`${email.toLowerCase()}:${code}`));
  if (!ok) {
    await env.DB.prepare("UPDATE email_codes SET attempts = attempts + 1 WHERE email = ? AND purpose = ?").bind(email, purpose).run();
    throw bad("That code isn't right");
  }
  await env.DB.prepare("DELETE FROM email_codes WHERE email = ? AND purpose = ?").bind(email, purpose).run();
}

async function uniquePid(env: Env, first: string, last: string): Promise<string> {
  const pre = idPrefix(first, last);
  for (let i = 0; i < 20; i++) {
    const pid = pre + randomSixDigits();
    const taken = await env.DB.prepare("SELECT 1 FROM users WHERE pid = ?").bind(pid).first();
    if (!taken) return pid;
  }
  throw new HttpError(500, "Couldn't create a player ID, try again");
}

const validEmail = (e: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e);

/* ---------- routes ---------- */

export const auth = new Hono<AppEnv>();

auth.post("/signup", async (c) => {
  const b = await c.req.json().catch(() => ({}));
  const first = str(b.first, 50), last = str(b.last, 50), email = str(b.email, 120).toLowerCase(), password = typeof b.password === "string" ? b.password : "";
  if (!first || !last) throw bad("Enter your first and last name");
  if (!validEmail(email)) throw bad("Enter a valid email address");
  if (password.length < 8 || password.length > 200) throw bad("Use at least 8 characters for your password");

  const existing = await c.env.DB.prepare("SELECT id, email_verified FROM users WHERE email = ?").bind(email).first<{ id: string; email_verified: number }>();
  if (existing?.email_verified) throw new HttpError(409, "An account already uses this email. Try logging in.");
  const { hash, salt } = await hashPassword(password);
  if (existing) {
    // Unverified sign-up started earlier: let them restart with new details.
    await c.env.DB.prepare("UPDATE users SET first_name=?, last_name=?, pass_hash=?, pass_salt=? WHERE id=?").bind(first, last, hash, salt, existing.id).run();
  } else {
    await c.env.DB.prepare(
      "INSERT INTO users (id,pid,first_name,last_name,email,pass_hash,pass_salt,status,is_admin,created_at) VALUES (?,?,?,?,?,?,?,'onboarding',?,?)",
    ).bind(newId(), await uniquePid(c.env, first, last), first, last, email, hash, salt, isAdminEmail(c.env, email) ? 1 : 0, now()).run();
  }
  await issueCode(c.env, email, "verify", (p) => c.executionCtx.waitUntil(p)).catch((e) => {
    if (!(e instanceof HttpError && e.status === 429)) throw e; // a recent code is still valid
  });
  return c.json({ ok: true });
});

auth.post("/verify", async (c) => {
  const b = await c.req.json().catch(() => ({}));
  const email = str(b.email, 120).toLowerCase(), code = str(b.code, 6);
  const u = await c.env.DB.prepare("SELECT * FROM users WHERE email = ?").bind(email).first<UserRow>();
  if (!u) throw bad("Request a new code");
  await checkCode(c.env, email, "verify", code);
  await c.env.DB.prepare("UPDATE users SET email_verified = 1 WHERE id = ?").bind(u.id).run();
  await createSession(c, u.id);
  return c.json({ ok: true });
});

auth.post("/resend", async (c) => {
  const b = await c.req.json().catch(() => ({}));
  const email = str(b.email, 120).toLowerCase();
  const purpose = b.purpose === "reset" ? "reset" : "verify";
  const u = await c.env.DB.prepare("SELECT email_verified FROM users WHERE email = ?").bind(email).first<{ email_verified: number }>();
  if (u && (purpose === "reset" ? true : !u.email_verified)) await issueCode(c.env, email, purpose, (p) => c.executionCtx.waitUntil(p));
  return c.json({ ok: true });
});

auth.post("/login", async (c) => {
  const b = await c.req.json().catch(() => ({}));
  const email = str(b.email, 120).toLowerCase(), password = typeof b.password === "string" ? b.password : "";
  const u = await c.env.DB.prepare("SELECT * FROM users WHERE email = ?").bind(email).first<UserRow>();
  const fail = () => { throw new HttpError(401, "That email and password don't match"); };
  if (!u || u.status === "deleted") return fail();
  const { hash } = await hashPassword(password, u.pass_salt);
  if (!timingSafeEqual(hash, u.pass_hash)) return fail();
  if (u.status === "suspended") throw new HttpError(403, "This account has been suspended. Contact an admin.");
  if (!u.email_verified) {
    await issueCode(c.env, email, "verify", (p) => c.executionCtx.waitUntil(p)).catch(() => {});
    return c.json({ needsVerification: true });
  }
  if (isAdminEmail(c.env, email) && !u.is_admin) await c.env.DB.prepare("UPDATE users SET is_admin = 1 WHERE id = ?").bind(u.id).run();
  await createSession(c, u.id);
  return c.json({ ok: true });
});

auth.post("/logout", async (c) => {
  const token = getCookie(c, COOKIE);
  if (token) await c.env.DB.prepare("DELETE FROM sessions WHERE token_hash = ?").bind(await sha256(token)).run();
  deleteCookie(c, COOKIE, { path: "/" });
  return c.json({ ok: true });
});

auth.post("/forgot", async (c) => {
  const b = await c.req.json().catch(() => ({}));
  const email = str(b.email, 120).toLowerCase();
  const u = await c.env.DB.prepare("SELECT id FROM users WHERE email = ? AND status != 'deleted'").bind(email).first();
  // Same answer whether or not the account exists, so emails can't be probed.
  if (u) await issueCode(c.env, email, "reset", (p) => c.executionCtx.waitUntil(p)).catch((e) => { if (!(e instanceof HttpError && e.status === 429)) throw e; });
  return c.json({ ok: true });
});

auth.post("/reset", async (c) => {
  const b = await c.req.json().catch(() => ({}));
  const email = str(b.email, 120).toLowerCase(), code = str(b.code, 6), password = typeof b.password === "string" ? b.password : "";
  if (password.length < 8 || password.length > 200) throw bad("Use at least 8 characters for your password");
  const u = await c.env.DB.prepare("SELECT id FROM users WHERE email = ? AND status != 'deleted'").bind(email).first<{ id: string }>();
  if (!u) throw bad("Request a new code");
  await checkCode(c.env, email, "reset", code);
  const { hash, salt } = await hashPassword(password);
  await c.env.DB.batch([
    c.env.DB.prepare("UPDATE users SET pass_hash = ?, pass_salt = ?, email_verified = 1 WHERE id = ?").bind(hash, salt, u.id),
    c.env.DB.prepare("DELETE FROM sessions WHERE user_id = ?").bind(u.id), // log out everywhere
  ]);
  return c.json({ ok: true });
});
