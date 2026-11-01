# Root-level Dockerfile for hosts like Render: build context = repo root, so no path settings to get wrong.
FROM python:3.12-slim
WORKDIR /srv
COPY backend/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt && useradd -m app && mkdir /data && chown app /data
COPY backend/app app
COPY backend/migrations migrations
COPY backend/alembic.ini .
USER app
CMD ["sh","-c","alembic upgrade head && python -m app.seed && gunicorn app.main:app -k uvicorn.workers.UvicornWorker -w ${WEB_CONCURRENCY:-4} -b 0.0.0.0:${PORT:-8000} --access-logfile - --timeout 60"]
