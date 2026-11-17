#!/usr/bin/env bash
# Serves the production build (run `npm run build` in web/ first) against the LOCAL Supabase stack only. Usage: web/tests/start_local.sh [port]
set -euo pipefail
cd "$(dirname "$0")/../.."
S=$(npx -y supabase@2.122.1 status -o json 2>/dev/null)
get() { node -e 'const s=JSON.parse(require("fs").readFileSync(0,"utf8"));process.stdout.write(s[process.argv[1]]||"")' "$1" <<<"$S"; }
API=$(get API_URL)
case "$API" in http://127.0.0.1:*|http://localhost:*) ;; *) echo "refusing: not a local Supabase ($API)"; exit 1;; esac
cd web
SUPABASE_URL="$API" SUPABASE_PUBLISHABLE_KEY="$(get PUBLISHABLE_KEY)" SUPABASE_SERVICE_ROLE_KEY="$(get SECRET_KEY)" SITE_URL="http://localhost:${1:-3120}" exec npx next start -p "${1:-3120}" -H localhost
