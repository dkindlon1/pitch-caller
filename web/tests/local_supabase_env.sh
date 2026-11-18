# Sourced by start_local.sh and dev_local.sh (run from the repo root). Sets LOCAL_SB_URL,
# LOCAL_SB_PUBLISHABLE_KEY and LOCAL_SB_SECRET_KEY for the LOCAL Supabase stack, or exits.
# It asks the supabase CLI first. When the CLI can't run (Smart App Control blocks its binary
# with "spawn UNKNOWN"), it reads the running Docker containers instead: the API port from the
# Kong container's port mapping and the keys from Kong's kong.yml. The keys are never printed.

local_sb_from_cli() {
  local s
  s=$(npx -y supabase@2.122.1 status -o json 2>/dev/null) || return 0
  [ -n "$s" ] || return 0
  get() { node -e 'try{const s=JSON.parse(require("fs").readFileSync(0,"utf8"));process.stdout.write(s[process.argv[1]]||"")}catch(e){}' "$1" <<<"$s"; }
  LOCAL_SB_URL=$(get API_URL)
  LOCAL_SB_PUBLISHABLE_KEY=$(get PUBLISHABLE_KEY)
  LOCAL_SB_SECRET_KEY=$(get SECRET_KEY)
  LOCAL_SB_SOURCE="supabase CLI"
}

local_sb_from_docker() {
  local pid kong hp yml
  command -v docker >/dev/null 2>&1 || return 0
  pid=$(sed -n 's/^project_id *= *"\([^"]*\)".*/\1/p' supabase/config.toml | head -n 1)
  [ -n "$pid" ] || return 0
  kong="supabase_kong_${pid}"
  hp=$(docker port "$kong" 8000/tcp 2>/dev/null | head -n 1) || return 0
  [ -n "$hp" ] || return 0
  LOCAL_SB_URL="http://127.0.0.1:${hp##*:}"
  # MSYS_NO_PATHCONV stops Git Bash rewriting the container path into a Windows path.
  yml=$(MSYS_NO_PATHCONV=1 docker exec "$kong" cat /home/kong/kong.yml 2>/dev/null) || return 0
  LOCAL_SB_PUBLISHABLE_KEY=$(grep -oE 'sb_publishable_[A-Za-z0-9_-]+' <<<"$yml" | sort -u || true)
  LOCAL_SB_SECRET_KEY=$(grep -oE 'sb_secret_[A-Za-z0-9_-]+' <<<"$yml" | sort -u || true)
  LOCAL_SB_SOURCE="Docker container $kong"
}

LOCAL_SB_URL="" LOCAL_SB_PUBLISHABLE_KEY="" LOCAL_SB_SECRET_KEY="" LOCAL_SB_SOURCE=""
local_sb_from_cli
if [ -z "$LOCAL_SB_URL" ] || [ -z "$LOCAL_SB_PUBLISHABLE_KEY" ] || [ -z "$LOCAL_SB_SECRET_KEY" ]; then
  LOCAL_SB_URL="" LOCAL_SB_PUBLISHABLE_KEY="" LOCAL_SB_SECRET_KEY=""
  local_sb_from_docker
fi
case "$LOCAL_SB_URL" in http://127.0.0.1:*|http://localhost:*) ;; *) echo "refusing: not a local Supabase (${LOCAL_SB_URL:-none found; is the stack running?})" >&2; exit 1;; esac
for k in "$LOCAL_SB_PUBLISHABLE_KEY" "$LOCAL_SB_SECRET_KEY"; do
  if [ -z "$k" ] || [ "$(printf '%s\n' "$k" | grep -c .)" != 1 ]; then echo "refusing: could not read exactly one local publishable and one secret key from ${LOCAL_SB_SOURCE:-the CLI or Docker}" >&2; exit 1; fi
done
echo "local Supabase at $LOCAL_SB_URL (keys from $LOCAL_SB_SOURCE)" >&2
