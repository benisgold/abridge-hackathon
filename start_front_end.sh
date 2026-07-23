#!/usr/bin/env bash
# Start the Vite dev server for the frontend.
# Runs on http://localhost:5173 and proxies /api to the backend on port 8000.
set -euo pipefail

cd "$(dirname "$0")/frontend"

if ! command -v npm >/dev/null 2>&1; then
  echo "error: 'npm' is not installed. Install Node.js from https://nodejs.org/" >&2
  exit 1
fi

if [ ! -d node_modules ]; then
  echo "Installing frontend dependencies (npm install)..."
  npm install
fi

echo "Starting frontend on http://localhost:5173 ..."
exec npm run dev
