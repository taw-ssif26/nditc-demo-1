# Free deployment (no card): Render + Neon + a free bucket + UptimeRobot

Render runs the app (sleeps when idle, forgets local files). **Neon** keeps the database. A free **S3-compatible bucket** keeps uploaded files (Neon has no file storage). UptimeRobot pings `/ping` every 5 minutes so Render never sleeps.

1. **Neon** (neon.com): create a project, then Connect → copy the connection string (keep "Connection pooling" on). Paste it exactly as it is into `DATABASE_URL`.
2. **File bucket** (pick one; both work with the same settings):
   - **Backblaze B2** (backblaze.com/b2): 10 GB free. Create a **private** bucket, then App Keys → add a key limited to that bucket. `S3_ENDPOINT` = `https://s3.<region>.backblazeb2.com`, `S3_REGION` = the region in the bucket's endpoint (like `us-west-004`), `S3_BUCKET` = bucket name, `S3_ACCESS_KEY` = keyID, `S3_SECRET_KEY` = applicationKey.
   - **Supabase, storage only** (supabase.com): 1 GB free. Create a project, Storage → private bucket, Storage → S3 Connection → copy endpoint/region and make an access key. Ignore its database.
   (Cloudflare R2 is also S3-compatible but usually asks for a card.)
3. **GitHub:** push the project to a private repo.
4. **Render** (render.com, sign in with GitHub): New → Blueprint → pick the repo → fill the blank variables: DATABASE_URL, S3_ENDPOINT, S3_REGION, S3_BUCKET, S3_ACCESS_KEY, S3_SECRET_KEY, BASE_URL (your `https://....onrender.com` address), SUPERADMIN_EMAIL, SUPERADMIN_PASSWORD (12+ chars).
5. Open `BASE_URL/admin`, sign in, set up 2FA. Upload one image to test the bucket.
6. **UptimeRobot:** monitor `BASE_URL/ping` every 5 minutes. Never point it at `/healthz` (that wakes the database).
7. **Watch Neon's usage page weekly.** The free plan has 100 compute-hours a month; if it runs out, the database stops until next month.
8. Backups: once a week run `pg_dump "<your Neon string>" | gzip > nditc.sql.gz` from your laptop and keep it.
