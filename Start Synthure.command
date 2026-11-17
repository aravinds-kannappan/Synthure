#!/bin/zsh
set -e
SYNTHURE_ROOT="$(cd -- "$(dirname -- "$0")" && pwd)"
cd "$SYNTHURE_ROOT/frontend"
if ! command -v npm >/dev/null 2>&1; then
  print 'Install Node.js 20.9 or newer, then run this launcher again.'
  read -r '?Press Return to close.'
  exit 1
fi
if [[ ! -d node_modules ]]; then
  npm ci
fi
print 'Starting Synthure locally. Open http://127.0.0.1:3000 in your browser.'
print 'Press Control-C in this window to stop Synthure.'
npm run dev -- --hostname 127.0.0.1 --port 3000
