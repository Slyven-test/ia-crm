#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/.."

COMPOSE="docker compose -f docker-compose.prod.yml"

echo "==> Pulling latest code"
git pull --ff-only

echo "==> Building images"
$COMPOSE build

echo "==> Starting services"
$COMPOSE up -d

echo "==> Applying migrations"
$COMPOSE exec backend alembic upgrade head

echo "==> Health checks"
curl -f http://localhost/health
curl -f http://localhost/api/health

echo "Deployment complete."
