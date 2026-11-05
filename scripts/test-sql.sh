#!/usr/bin/env bash
# Every Supabase/sync test against a real Postgres. Each test makes its own scratch database and applies
# supabase/test/auth_stub.sql plus the migrations, so PGURL only needs superuser access.
# Usage: PGURL=postgresql://postgres@localhost:5432/postgres scripts/test-sql.sh
set -euo pipefail
cd "$(dirname "$0")/.."
: "${PGURL:?set PGURL to a Postgres superuser connection string}"
export PGURL
run=scripts/run-check.sh
$run sync_test          node supabase/test/sync_test.js
$run review_test        node supabase/test/review_test.js
$run client_review_test node supabase/test/client_review_test.js
$run sync_auth_test     node app/sync_auth_test.js
$run app_sync_e2e       node supabase/test/app_sync_e2e.js
