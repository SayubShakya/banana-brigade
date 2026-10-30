#!/usr/bin/env bash
# Starts Banana Brigade: ./run.sh  (or ./run.sh --dev to restart on changes, ./run.sh --test for tests)
# Written with help from a generative AI coding assistant; reviewed by Sayub Shakya.
set -euo pipefail
cd "$(dirname "$0")"
if ! command -v node >/dev/null 2>&1; then echo "Install Node.js 22 or later from https://nodejs.org" >&2; exit 1; fi
# Node 22.9 or later (needed for --env-file-if-exists).
if ! node -e 'const [a, b] = process.versions.node.split(".").map(Number); process.exit(a > 22 || (a === 22 && b >= 9) ? 0 : 1)'; then
  echo "Node.js 22.9 or later is needed (you have $(node -v))." >&2; exit 1
fi
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
# Restart: if the port is taken by an older Banana Brigade server, stop it first.
# Anything else on the port is left alone (it could be another app), with a message.
# The port the server will use: PORT from the command line (PORT=3105 ./run.sh) wins over .env.
port=${PORT:-$(grep -E '^PORT=' .env 2>/dev/null | cut -d= -f2 | tr -d '[:space:]')}
port=${port:-3100}
if [ "${1:-}" != "--test" ] && command -v lsof >/dev/null 2>&1; then
  for pid in $(lsof -nP -t -iTCP:"$port" -sTCP:LISTEN 2>/dev/null); do
    cwd=$(lsof -a -p "$pid" -d cwd -Fn 2>/dev/null | sed -n 's/^n//p')
    cmd=$(ps -o command= -p "$pid" 2>/dev/null || true)
    if [ "$cwd" = "$PWD" ] && [[ "$cmd" == *server/index.js* ]]; then
      echo "Port $port is used by an older Banana Brigade server (pid $pid): stopping it…"
      kill "$pid" 2>/dev/null || true
      for _ in 1 2 3 4 5 6 7 8 9 10; do kill -0 "$pid" 2>/dev/null || break; sleep 0.3; done
      kill -0 "$pid" 2>/dev/null && kill -9 "$pid" 2>/dev/null || true
    else
      echo "Port $port is used by another program (pid $pid: ${cmd:-unknown}). Stop it, or set PORT in .env." >&2
      exit 1
    fi
  done
fi
case "${1:-}" in
  --dev)  exec npm run dev ;;
  --test) exec npm test ;;
  "")     exec npm start ;;
  *)      echo "Usage: ./run.sh [--dev | --test]" >&2; exit 1 ;;
esac
