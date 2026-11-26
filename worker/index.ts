import { Hono } from "hono";
import { admin } from "./admin";
import { auth } from "./auth";
import { HttpError, type AppEnv, type Env } from "./lib";
import { expirePending, matches } from "./matches";
import { profile } from "./profile";
import { API_COMPAT, COMPAT_HEADER } from "../shared/version";

const api = new Hono<AppEnv>().basePath("/api");

api.onError((err, c) => {
  if (err instanceof HttpError) return c.json({ error: err.message }, err.status as any);
  console.error(err);
  return c.json({ error: "30-All hit a problem on our side. Try again in a moment." }, 500);
});

// A tab running a copy of the app that's too old for this API reloads itself (see shared/version.ts).
// Old copies without the header count as level 0, so nothing is forced until API_COMPAT is bumped.
api.use("*", async (c, next) => {
  if (c.req.path !== "/api/health" && Number(c.req.header(COMPAT_HEADER) ?? 0) < API_COMPAT)
    return c.json({ error: "30-All has been updated. Refresh the page to continue.", reload: true }, 426);
  await next();
});

// Basic CSRF protection: state-changing requests must come from our own site.
api.use("*", async (c, next) => {
  if (!["GET", "HEAD", "OPTIONS"].includes(c.req.method)) {
    const origin = c.req.header("Origin");
    if (origin && new URL(origin).host !== new URL(c.req.url).host) return c.json({ error: "Bad origin" }, 403);
  }
  await next();
});

api.get("/health", (c) => c.json({ ok: true }));
/** For the welcome page (no sign-in): how many players and courts are on 30-All. */
api.get("/public/stats", async (c) => {
  const r = await c.env.DB.prepare(`SELECT (SELECT COUNT(*) FROM users WHERE status = 'active') AS players,
    (SELECT COUNT(DISTINCT uc.court_id) FROM user_courts uc JOIN users u ON u.id = uc.user_id JOIN courts ct ON ct.id = uc.court_id WHERE u.status = 'active' AND ct.status = 'approved') AS courts`).first<{ players: number; courts: number }>();
  c.header("Cache-Control", "public, max-age=300");
  return c.json(r ?? { players: 0, courts: 0 });
});
api.route("/auth", auth);
api.route("/", profile);
api.route("/", matches);
api.route("/admin", admin);
api.notFound((c) => c.json({ error: "Not found" }, 404));

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext) {
    const url = new URL(request.url);
    if (url.pathname.startsWith("/api/")) return api.fetch(request, env, ctx);
    return env.ASSETS.fetch(request); // React app (single-page app fallback is configured in wrangler.jsonc)
  },
  async scheduled(_event: ScheduledController, env: Env, ctx: ExecutionContext) {
    ctx.waitUntil(expirePending(env, (p) => ctx.waitUntil(p)));
  },
} satisfies ExportedHandler<Env>;
