# NDITC platform

```
Browser → Cloudflare → Caddy (HTTPS) → FastAPI ×4 workers → PostgreSQL
                                           ├→ Redis (rate limits)
                                           └→ uploads volume (pub/ images, priv/ documents)
```
Public pages are server-rendered at real URLs (/, /about, /activities, /projects, /executives, /publication, /blog, /contact, /developers, /policy, /mobile-app)
with per-page title/description/canonical, sitemap.xml and robots.txt; the immersive client script takes over after load. Content comes from the database,
so admin edits appear on the public site within ~2 minutes. `/admin` (admins), `/portal` (students), one sign-in page.

**Student flow:** a student opens `/portal`, clicks *Create an account* (name, email, class/roll, own password) → status *pending* and cannot sign in yet →
an admin opens **Approvals** in `/admin`, checks name + class/roll, approves or rejects (one by one or in bulk) → the student signs in with the password they chose.
Rejecting or disabling someone cuts off an open session immediately. Sign-up is limited to 5/hour/IP, has a hidden honeypot field, never reveals whether an email is
registered, and stops accepting requests when 500 are waiting (`MAX_PENDING`). Admins can still add a student by hand or by CSV (they get a temporary password).

## Deploy (VPS: 2 GB RAM, Ubuntu 24.04, Docker)
1. Point your domain's DNS at the VPS (Cloudflare: proxied, SSL mode "Full (strict)").
2. `./scripts/make-env.sh` (asks for your domain and email, generates all secrets, prints the super-admin password once).
3. `docker compose up -d --build`, then check `docker compose ps` (all healthy) and `https://DOMAIN/healthz`.
4. Open `/admin`, sign in as super admin, set up 2FA when asked.
5. `crontab -e` → `0 3 * * * /opt/nditc/scripts/backup.sh`, set up `rclone` to Cloudflare R2, and do one test restore.
6. Firewall: allow only 22, 80, 443 (`ufw`). Disable SSH password login. Never publish the Postgres/Redis ports.
7. Run `k6 run -e BASE=https://DOMAIN loadtest.js` from your laptop (not the server) before announcing.
8. Add UptimeRobot (free) on `/healthz`.

Lost authenticator: `docker compose exec api python -m app.seed reset2fa you@example.com`.
Schema changes: edit `app/models.py`, run `alembic revision --autogenerate -m "what"`, commit the new file in `migrations/versions/`; it applies on next deploy.

Free, no-card deployment (Render + Supabase): see `DEPLOY-FREE.md`.

## Events, quizzes and forms
**Events** (admin → Events): date, end, location, seats, registration open/deadline, optional registration form. The public Activities page and home page list them automatically
(upcoming first, past below, with search-engine event data). Students register / cancel / join a waitlist from the portal; when someone cancels, the next waitlisted student is
promoted automatically. Admins see who registered, tick attendance, remove people and download a CSV.
**Forms & quizzes** (admin → Forms & quizzes): question types short answer, paragraph, multiple choice, checkboxes, rating, number. Quizzes are auto-graded (points, accepted answers,
time limit, one attempt, choose whether students see nothing / score / correct answers). Admins get per-question statistics, every response, and a CSV. Correct answers never leave
the server before a student submits. Exports neutralise spreadsheet formulas.

**Who can join an event** (set per event in the admin): **Public** = shown on the website, anyone can register without an account (name, email, optional phone/school, plus the event's form);
**Students only** = portal only, approved students; **Invite only** = chosen students. Guests and students share the same seats and waitlist, and admins see both in one list
(marked Guest / Student). Guest sign-up is limited to 10/hour/IP and has a hidden honeypot field; emails are not verified, so check the list before the event.

## Effects switch (calm mode)
A pill at the top right of every public page ("Effects on / off") turns all lights, particles, glow and animation off for the whole site; the same pages, navigation and features remain,
in a still, softer-coloured version. The choice is remembered per visitor (localStorage `nditc_fx`). With no saved choice, effects start **off** for visitors whose device asks for
reduced motion or data saving, and **on** for everyone else. `static/fx.js` decides this before the page paints (no flash); all calm styles live under `html[data-fx=off]` in `site.css`.

## Security model
argon2id · httpOnly SameSite=Strict cookie + required `X-Requested-With` header on writes · session bound to password version (changing a password logs out other devices) ·
role/active re-checked in DB per request · temp passwords must be changed at first login · 8 wrong passwords = 15 min lock · login 5/min/IP, everything 300/min/IP ·
2FA (TOTP) required for admins in production · strict CSP, nosniff, HSTS · uploads: extension allow-list, magic bytes, random names, 20 MB, private files only via authorised endpoint · audit log.

## Tests
`frontend-tests/run.sh` drives the real site, admin and portal in a headless DOM against a live server (needs Node: `cd frontend-tests && npm i`).
`cd backend && pip install -r requirements.txt && python -m pytest tests` (SQLite) or `TEST_DATABASE_URL=postgresql+psycopg://… python -m pytest tests` (Postgres).

## Known limits
No virus scanning of uploads · no email (an admin resets passwords) · no image resizing (upload web-sized images) · rate-limit identity relies on Cloudflare's `CF-Connecting-IP`
(keep the origin reachable only through Cloudflare) · no staging environment or error tracking (add Sentry free tier).
