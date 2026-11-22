#!/usr/bin/env bash
# One-command start for Banana Brigade: checks Node, installs packages, creates .env,
# builds the React app, starts MongoDB if needed, frees the port, then runs the server.
# Usage: ./run.sh (normal), ./run.sh --dev (live reload), ./run.sh --test (run the tests)
# Stop on any error, on unset variables, and on a failure inside a pipe.
set -euo pipefail
# Always run from the folder this script is in.
cd "$(dirname "$0")"
# Check that Node.js is installed and is version 22.9 or newer.
if ! command -v node >/dev/null 2>&1; then echo "Install Node.js 22 or later from https://nodejs.org" >&2; exit 1; fi
if ! node -e 'const [a, b] = process.versions.node.split(".").map(Number); process.exit(a > 22 || (a === 22 && b >= 9) ? 0 : 1)'; then
  echo "Node.js 22.9 or later is needed (you have $(node -v))." >&2; exit 1
fi
# Install packages if node_modules is missing or package.json has changed since the last install.
if [ ! -d node_modules ] || [ package.json -nt node_modules ]; then npm install; touch node_modules; fi
# First run only: copy .env.example to .env with a new random secret for signing session cookies.
if [ ! -f .env ]; then
  secret=$(node -e "console.log(require('crypto').randomBytes(32).toString('hex'))")
  sed "s/^SESSION_SECRET=.*/SESSION_SECRET=$secret/" .env.example > .env
  echo "Created .env with a random SESSION_SECRET."
fi
# Rebuild the React app if it was never built or any client file is newer than the last build.
if [ ! -f client/dist/index.html ] || [ -n "$(find client/src client/index.html -newer client/dist/index.html -print -quit)" ]; then
  echo "Building the React app…"; npm run build >/dev/null
fi
# If using a local MongoDB (not a cloud mongodb+srv one) and it does not answer a ping, start it with Homebrew.
if ! grep -q '^MONGODB_URI=mongodb+srv' .env 2>/dev/null && command -v mongosh >/dev/null 2>&1; then
  if ! mongosh --quiet --eval 'db.runCommand({ping:1}).ok' >/dev/null 2>&1; then
    echo "Starting MongoDB…"; brew services start mongodb-community >/dev/null 2>&1 || true; sleep 2
  fi
fi
# Port: the PORT environment variable, else PORT in .env, else 3100.
port=${PORT:-$(grep -E '^PORT=' .env 2>/dev/null | cut -d= -f2 | tr -d '[:space:]')}
port=${port:-3100}
# Before starting the server, check what is listening on the port (not needed for --test).
if [ "${1:-}" != "--test" ] && command -v lsof >/dev/null 2>&1; then
  for pid in $(lsof -nP -t -iTCP:"$port" -sTCP:LISTEN 2>/dev/null); do
    cwd=$(lsof -a -p "$pid" -d cwd -Fn 2>/dev/null | sed -n 's/^n//p')
    cmd=$(ps -o command= -p "$pid" 2>/dev/null || true)
    # Only stop it if it is an older copy of this same server (same folder, runs server/index.js).
    if [ "$cwd" = "$PWD" ] && [[ "$cmd" == *server/index.js* ]]; then
      echo "Port $port is used by an older Banana Brigade server (pid $pid): stopping it…"
      kill "$pid" 2>/dev/null || true
      # Wait up to about 3 seconds for it to exit, then force-stop it.
      for _ in 1 2 3 4 5 6 7 8 9 10; do kill -0 "$pid" 2>/dev/null || break; sleep 0.3; done
      kill -0 "$pid" 2>/dev/null && kill -9 "$pid" 2>/dev/null || true
    else
      # Never stop someone else's program; ask the user to free the port instead.
      echo "Port $port is used by another program (pid $pid: ${cmd:-unknown}). Stop it, or set PORT in .env." >&2
      exit 1
    fi
  done
fi
# Choose what to run; exec replaces this script with npm so Ctrl+C reaches the server directly.
case "${1:-}" in
  --dev)  exec npm run dev ;;
  --test) exec npm test ;;
  "")     exec npm start ;;
  *)      echo "Usage: ./run.sh [--dev | --test]" >&2; exit 1 ;;
esac
