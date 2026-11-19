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
npm run build && npx wrangler dev --var ADMIN_EMAILS:you@example.com
```

Open http://localhost:8787. In development, emails (including verification codes) are **printed in the terminal** where `wrangler dev` is running.

For frontend work with hot reload, keep `wrangler dev` running and in a second terminal run `npm run dev` (http://localhost:5173 forwards `/api` to the Worker).

```bash
npm test          # score rules, player IDs, dates
npm run typecheck
```

## Deploy to Cloudflare (free *.workers.dev address)

1. Log in: `npx wrangler login`
2. Create the database: `npx wrangler d1 create thirty-all-db`, then paste the printed `database_id` into `wrangler.jsonc`.
3. Create the photo bucket: `npx wrangler r2 bucket create thirty-all-photos`
4. Set up the database: `npm run db:migrate:remote`
5. In `wrangler.jsonc` → `vars`, set:
   - `ADMIN_EMAILS`: comma-separated emails that become admins when they sign up or log in.
   - `APP_URL`: your app's address, e.g. `https://thirty-all.<your-subdomain>.workers.dev` (used in email links).
6. Deploy: `npm run deploy`

### Email (needed before friends can sign up)

Sign-up needs a verification code by email. Both providers below require **a domain you own** to send to other people. Until you set one up, keep `EMAIL_PROVIDER: "console"` and read codes with `npx wrangler tail` (fine for testing, not for real users).

- **Cloudflare Email Service**: add your domain to Cloudflare and onboard it in Email Service. Then in `wrangler.jsonc` add `"send_email": [{ "name": "EMAIL" }]`, set `EMAIL_PROVIDER` to `"cloudflare"` and `EMAIL_FROM` to an address on that domain.
- **Resend**: verify your domain at resend.com, then run `npx wrangler secret put RESEND_API_KEY`, set `EMAIL_PROVIDER` to `"resend"` and `EMAIL_FROM` to an address on that domain.

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
