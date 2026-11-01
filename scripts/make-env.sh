#!/bin/sh
# Creates .env with strong random secrets. Run once on the server: ./scripts/make-env.sh
set -eu
cd "$(dirname "$0")/.."
[ -e .env ] && { echo ".env already exists, not overwriting."; exit 1; }
printf "Domain (e.g. nditc.net): "; read DOMAIN
printf "Your admin email: "; read EMAIL
rnd() { openssl rand -base64 48 | tr -d '/+=\n' | cut -c1-"$1"; }
ADMINPW=$(rnd 20)
cat > .env <<EOT
DOMAIN=$DOMAIN
BASE_URL=https://$DOMAIN
DB_PASSWORD=$(rnd 32)
SECRET_KEY=$(rnd 64)
SUPERADMIN_EMAIL=$EMAIL
SUPERADMIN_PASSWORD=$ADMINPW
REQUIRE_2FA=1
EOT
chmod 600 .env
echo; echo "Super admin login:  $EMAIL  /  $ADMINPW"; echo "Save this password now (also in .env). You will be asked to set up 2FA at first login."
