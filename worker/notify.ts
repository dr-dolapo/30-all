import { sendMail } from "./email";
import { newId, now, type Env } from "./lib";
import { emphasise, plain } from "../shared/notifText";

/**
 * Creates an in-app notification and (optionally) emails it.
 * Emails go out in the background via waitUntil so the request isn't slowed down.
 */
export async function notify(
  env: Env,
  waitUntil: (p: Promise<unknown>) => void,
  userIds: string[],
  text: string,
  opts: { matchId?: string | null; subject?: string; email?: boolean } = {},
): Promise<void> {
  const ids = [...new Set(userIds)].filter(Boolean);
  if (!ids.length) return;
  const t = now();
  const rich = emphasise(text); // key details in **bold** for the inbox
  await env.DB.batch(
    ids.map((id) =>
      env.DB.prepare("INSERT INTO notifications (id,user_id,text,match_id,created_at) VALUES (?,?,?,?,?)").bind(newId(), id, rich, opts.matchId ?? null, t),
    ),
  );
  if (opts.email === false) return;
  const placeholders = ids.map(() => "?").join(",");
  const { results } = await env.DB.prepare(`SELECT email FROM users WHERE id IN (${placeholders}) AND status IN ('active','onboarding')`).bind(...ids).all<{ email: string }>();
  for (const r of results) waitUntil(sendMail(env, { to: r.email, subject: opts.subject ?? "30-All update", text: plain(text) }));
}
