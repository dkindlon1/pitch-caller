#!/usr/bin/env bash
# Serves the production build (run `npm run build` in web/ first) against the LOCAL Supabase stack only. Usage: web/tests/start_local.sh [port]
set -euo pipefail
cd "$(dirname "$0")/../.."
# URL and keys from the supabase CLI, or from the running Docker containers when the CLI is blocked; localhost only, keys never printed
. web/tests/local_supabase_env.sh
cd web
SUPABASE_URL="$LOCAL_SB_URL" SUPABASE_PUBLISHABLE_KEY="$LOCAL_SB_PUBLISHABLE_KEY" SUPABASE_SERVICE_ROLE_KEY="$LOCAL_SB_SECRET_KEY" SITE_URL="http://localhost:${1:-3120}" exec npx next start -p "${1:-3120}" -H localhost
