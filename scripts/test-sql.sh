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
$run rls_matrix_test    node supabase/test/rls_matrix_test.js
$run waitlist_test      node supabase/test/waitlist_test.js
$run v11_kinds_test     node supabase/test/v11_kinds_test.js   # v1.1 Step 5: six kinds and v1.1 tags in the uploads tables
$run v12_sessions_test  node supabase/test/v12_sessions_test.js   # v1.2 Step 4: charted sessions, way-off cells, glove spots and leans sync unchanged (no migration)
