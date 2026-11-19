# 30-All

Tennis scorekeeping and community app for friends: profiles, verified courts, racquets, match scores with opponent confirmation, head-to-head records and an admin dashboard.

## How it's built

| Part | Technology |
|---|---|
| Frontend | React + Vite (`src/`), mobile-first web app |
| API | Cloudflare Worker with [Hono](https://hono.dev) (`worker/`), served from the same Worker as the frontend |
| Database | Cloudflare D1 (`migrations/`) |
| Photos | Cloudflare R2 |
| Expiring scores | Cron trigger, hourly: scores pending for 7 days are auto-rejected and everyone is notified |
| Email | Cloudflare Email Service or Resend (switchable), or printed to the console in development |
| Shared rules | `shared/`: score validation, player IDs, reference lists, avatars, used by both the browser and the API |

The frontend and API run as one Worker (Cloudflare's recommended setup for full-stack apps, in place of a separate Pages project), so there is one thing to deploy.

## Run it on your computer

```bash
npm install
npm run db:migrate:local          # creates the local database with the starter courts and racquets
cp .dev.vars.example .dev.vars    # local settings: emails print to the terminal
npm run build && npx wrangler dev
```

Open http://localhost:8787. In development, emails (including verification codes) are **printed in the terminal** where `wrangler dev` is running.

For frontend work with hot reload, keep `wrangler dev` running and in a second terminal run `npm run dev` (http://localhost:5173 forwards `/api` to the Worker).

```bash
npm test          # score rules, player IDs, dates
npm run typecheck
```

## Deploy (no local commands needed)

Production runs at **https://thirtyall.app** and deploys automatically from the `main` branch with Cloudflare Workers Builds.

One-time setup in the Cloudflare dashboard:
1. **D1:** create a database named `thirty-all-db` and put its ID in `wrangler.jsonc` (`database_id`).
2. **R2:** enable R2 and create a bucket named `thirty-all-photos`.
3. **Email Service:** onboard `thirtyall.app` for sending.
4. **Workers & Pages → Create → Import a repository:** pick `dr-dolapo/30-all`, project name `thirty-all`, build command `npm run build`, deploy command `npm run deploy:ci` (applies database migrations, then deploys).
5. Give the build's API token **D1 · Edit** permission (My Profile → API Tokens), so migrations can run.
6. After the first deploy: **Settings → Variables and Secrets** on the Worker, add `ADMIN_EMAILS` (comma-separated).

After that, every merge to `main` builds, migrates and deploys automatically.

For local development, copy `.dev.vars.example` to `.dev.vars` (emails are then printed to the terminal).

## Product rules (v1)

- **Accounts:** email + password, 6-digit email code (expires in 10 min, resend after 60 s, 5 tries). 18+ only, full date of birth required.
- **Player ID:** first initial + last initial + 6 random digits (e.g. `DA348789`). Single names use the first 2 letters; hyphenated names use the first letter. It never changes.
- **Profile:** gender, nationality (Nigeria first), DOB, WhatsApp (admins only), height (metric/imperial, hidden), handedness, backhand, favourite shot, photo or 1 of 15 avatars.
- **Courts:** Nigeria only for now: state, then approved courts. 1 home + up to 2 secondary. Players can submit a missing court, which shows *Pending* until an admin approves, rejects or merges it.
- **Racquets:** 1–3, one primary. From the starter list, or typed in (no approval; not added to the shared list).
- **Matches:** singles or doubles; date up to 14 days back. Formats: best of 3 sets (full third set), 1 set to 6, 1 set to 4, super tie-break to 10.
  - Valid sets to 6: 6-0…6-4, 7-5, 7-6. Sets to 4: 4-0…4-2, 5-3, 5-4. Super tie-break: 10+, won by 2.
  - An opponent accepts or rejects (one opponent is enough in doubles). After 7 days with no answer, the score is auto-rejected. Everyone involved is notified in-app and by email.
  - The submitter can delete a pending score; confirmed scores are locked.
- **Admin:** approve/reject/merge/edit/add courts; suspend, delete, promote users and correct DOB; remove profile photos.

## Folder guide

```
shared/      rules.ts (scores, IDs, dates) · data.ts (countries, states) · avatars.ts
worker/      index.ts (entry + cron) · auth.ts · profile.ts · matches.ts · admin.ts · notify.ts · email.ts
src/         main.tsx (routes) · ui.tsx (layout, cards, calendar) · forms.tsx (profile forms) · pages/
migrations/  0001_init.sql (schema) · 0002_seed.sql (starter courts & racquets)
```
