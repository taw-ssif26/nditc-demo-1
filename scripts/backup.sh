#!/bin/sh
# Daily: crontab -e →  0 3 * * * /opt/nditc/scripts/backup.sh
# A backup that only lives on the same server is not a backup: copy ./backups off-site (see last line).
set -eu
cd "$(dirname "$0")/.."; D=backups; T=$(date +%F-%H%M); mkdir -p "$D"
docker compose exec -T db pg_dump -U nditc nditc | gzip > "$D/db-$T.sql.gz"
docker run --rm -v "$(basename "$PWD")_uploads":/data -v "$PWD/$D":/out alpine tar czf "/out/uploads-$T.tgz" -C /data .
find "$D" -type f -mtime +14 -delete
# rclone copy "$D" r2:nditc-backups   # Cloudflare R2 free tier is enough; set up once with `rclone config`
