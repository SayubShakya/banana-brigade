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
case "${1:-}" in
  --dev)  exec npm run dev ;;
  --test) exec npm test ;;
  "")     exec npm start ;;
  *)      echo "Usage: ./run.sh [--dev | --test]" >&2; exit 1 ;;
esac
