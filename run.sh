#!/usr/bin/env bash
# Starts Banana Brigade: ./run.sh  (or ./run.sh --dev to restart on changes, ./run.sh --test for tests)
# Written with help from a generative AI coding assistant; reviewed by Sayub Shakya.
set -euo pipefail
cd "$(dirname "$0")"
if ! command -v node >/dev/null 2>&1; then echo "Install Node.js 22 or later from https://nodejs.org" >&2; exit 1; fi
if [ "$(node -p 'process.versions.node.split(".")[0]')" -lt 22 ]; then echo "Node.js 22 or later is needed." >&2; exit 1; fi
if [ ! -d node_modules ] || [ package.json -nt node_modules ]; then npm install; touch node_modules; fi
# First run: create .env with a random session secret (never committed).
if [ ! -f .env ]; then
  secret=$(node -e "console.log(require('crypto').randomBytes(32).toString('hex'))")
  sed "s/^SESSION_SECRET=.*/SESSION_SECRET=$secret/" .env.example > .env
  echo "Created .env with a random SESSION_SECRET."
fi
# Build the React screens when they are missing or older than the source.
if [ ! -f client/dist/index.html ] || [ -n "$(find client/src client/index.html -newer client/dist/index.html -print -quit)" ]; then
  echo "Building the React app…"; npm run build >/dev/null
fi
# MongoDB must be running (local install via Homebrew, or MONGODB_URI pointing at Atlas).
if ! grep -q '^MONGODB_URI=mongodb+srv' .env 2>/dev/null && command -v mongosh >/dev/null 2>&1; then
  if ! mongosh --quiet --eval 'db.runCommand({ping:1}).ok' >/dev/null 2>&1; then
    echo "Starting MongoDB…"; brew services start mongodb-community >/dev/null 2>&1 || true; sleep 2
  fi
fi
case "${1:-}" in
  --dev)  exec npm run dev ;;
  --test) exec npm test ;;
  "")     exec npm start ;;
  *)      echo "Usage: ./run.sh [--dev | --test]" >&2; exit 1 ;;
esac
