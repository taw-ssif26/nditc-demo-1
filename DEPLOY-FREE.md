# Free deployment (no credit card): Render + Supabase + UptimeRobot

Render runs the app (free web service, sleeps when idle, forgets local files). Supabase keeps the database and uploaded files. UptimeRobot pings `/ping` every 5 minutes so Render never sleeps.

1. **Supabase** (supabase.com, sign in with GitHub): New project → pick the region nearest you, set a database password.
   - Database URL: Project Settings → Database → Connection string → **Session pooler** (the direct one is IPv6-only). Change the start to `postgresql+psycopg://`.
   - Files: Storage → New bucket named `nditc` (keep it **private**). Then Storage → S3 Connection → copy the endpoint and region, and "New access key" → copy key id + secret.
2. **GitHub:** push this project to a private repo (`.env` is git-ignored).
3. **Render** (render.com, sign in with GitHub): New → Blueprint → pick the repo. Fill the empty variables:
   DATABASE_URL, S3_ENDPOINT, S3_REGION, S3_ACCESS_KEY, S3_SECRET_KEY, BASE_URL (your `https://nditc.onrender.com` or custom domain),
   SUPERADMIN_EMAIL, SUPERADMIN_PASSWORD (12+ chars). Deploy; first build takes ~5-10 minutes.
4. Open `BASE_URL/admin`, sign in, set up 2FA.
5. **UptimeRobot** (free): New monitor → HTTP(s) → `BASE_URL/ping` → every 5 minutes. Use `/ping`, not `/healthz`.
6. Optional: custom domain in Render → Settings → Custom Domains (add the CNAME at your DNS). If you put Cloudflare in front, set `TRUST_CF=1`.
7. Backups: Supabase free has no point-in-time backups. Once a week run `pg_dump "<session pooler url without +psycopg>" | gzip > nditc.sql.gz` from your laptop and keep it.

Limits to expect: 0.1 CPU / 512 MB (logins take ~1-2 s), Supabase free pauses after a period of inactivity and caps at 500 MB database / 1 GB files, Render may restart the service at any time (users stay signed in, nothing is lost).
