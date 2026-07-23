#!/usr/bin/env bash
# Start the FastAPI backend (abridge-hackathon patient cost-estimate flow).
# Runs on http://localhost:8000 — the frontend's Vite dev server proxies /api here.
set -euo pipefail

cd "$(dirname "$0")/backend"

if ! command -v uv >/dev/null 2>&1; then
  echo "error: 'uv' is not installed. Install it from https://docs.astral.sh/uv/" >&2
  exit 1
fi

echo "Syncing backend dependencies (uv sync)..."
uv sync

echo "Starting backend on http://localhost:8000 ..."
exec uv run uvicorn app.main:app --reload --reload-dir app --port 8000
