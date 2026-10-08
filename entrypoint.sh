#!/bin/sh
set -e

echo "[Entrypoint] Applying database migrations..."
python manage.py migrate --noinput

echo "[Entrypoint] Starting application: $@"
exec "$@"
