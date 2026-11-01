#!/bin/sh
cd /home/claude/nditc/backend
rm -f /tmp/e2e.db; rm -rf /tmp/e2edata
export DATABASE_URL=sqlite:////tmp/e2e.db SECRET_KEY=e2e-secret-key-e2e-secret-key-e2e-secret DATA_DIR=/tmp/e2edata AUTO_CREATE=1 SUPERADMIN_EMAIL=boss@x.org SUPERADMIN_PASSWORD=supersecret-123 LOGIN_LIMIT=1000/minute REGISTER_LIMIT=1000/hour BASE_URL=http://127.0.0.1:8000
python -m app.seed
python -m uvicorn app.main:app --port 8000 --log-level warning &
P=$!; sleep 4
cd /tmp/fe && node e2e.js; R=$?
kill $P; exit $R
