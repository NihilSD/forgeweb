# Shared helpers for the production scripts. Sourced, not executed.
set -euo pipefail

FORGE_DIR="${FORGE_DIR:-$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)}"
FORGE_ENV_FILE="${FORGE_ENV_FILE:-/etc/forge/forge.env}"
FORGE_STATE_DIR="${FORGE_STATE_DIR:-/var/lib/forge}"
export FORGE_ENV_FILE

log() { printf '%s %s\n' "$(date -u +%FT%TZ)" "$*" >&2; }
die() { log "ERROR: $*"; exit 1; }

check_env_file() {
  [[ -f "$FORGE_ENV_FILE" ]] || die "missing $FORGE_ENV_FILE (copy infra/production/forge.env.example)"
  if [[ -z "${FORGE_ALLOW_LOOSE_ENV:-}" ]]; then
    local mode
    mode="$(stat -c '%a' "$FORGE_ENV_FILE")"
    [[ "$mode" == "600" || "$mode" == "400" ]] || die "$FORGE_ENV_FILE must be mode 600 (is $mode)"
  fi
}

# docker compose with the production file and the secret env file for interpolation.
dc() {
  docker compose -f "$FORGE_DIR/docker-compose.yml" ${FORGE_COMPOSE_OVERRIDE:+-f "$FORGE_COMPOSE_OVERRIDE"} \
    --env-file "$FORGE_ENV_FILE" "$@"
}

# Reads one variable from the env file (Compose syntax, so it is parsed rather than sourced).
env_get() {
  grep -E "^$1=" "$FORGE_ENV_FILE" | tail -n 1 | cut -d= -f2- | sed -e 's/^"\(.*\)"$/\1/' -e "s/^'\(.*\)'$/\1/"
}

current_tag() { cat "$FORGE_STATE_DIR/current" 2>/dev/null || true; }
previous_tag() { cat "$FORGE_STATE_DIR/previous" 2>/dev/null || true; }

# Waits until the API answers /health with status ok and the expected version, through the web
# container's /api/v1 proxy (the same path users take, minus Caddy).
wait_healthy() {
  local tag="$1" tries="${2:-60}" body=""
  for ((i = 1; i <= tries; i++)); do
    # A crash-looping API won't recover by waiting: fail fast to shorten the outage.
    local restarts
    restarts="$(docker inspect -f '{{.RestartCount}}' "$(dc ps -q api)" 2>/dev/null || echo 0)"
    if ((restarts >= 3)); then
      log "api restarted $restarts times: $(dc logs --tail 3 api 2>&1 | tail -n 3)"
      return 1
    fi
    body="$(dc exec -T web node -e "fetch('http://127.0.0.1:3000/api/v1/health').then(r=>r.text()).then(t=>console.log(t),()=>process.exit(1))" 2>/dev/null || true)"
    if [[ "$body" == *'"status":"ok"'* && "$body" == *"\"version\":\"$tag\""* ]]; then
      log "healthy: $tag"
      return 0
    fi
    sleep 2
  done
  log "not healthy after $((tries * 2))s; last response: ${body:-none}"
  return 1
}

# The public path: Caddy, TLS and the domain, from this host (--resolve skips DNS).
wait_edge() {
  local tag="$1" domain port tries="${2:-60}" body=""
  domain="$(env_get FORGE_DOMAIN)"
  port="${FORGE_EDGE_PORT:-443}"
  for ((i = 1; i <= tries; i++)); do
    body="$(curl -fsS -m 5 ${FORGE_EDGE_INSECURE:+-k} --resolve "$domain:$port:127.0.0.1" \
      "https://$domain:$port/api/v1/health" 2>/dev/null || true)"
    if [[ "$body" == *"\"version\":\"$tag\""* ]]; then
      log "edge ok: https://$domain:$port"
      return 0
    fi
    sleep 2
  done
  log "edge check failed for https://$domain:$port (Caddy/TLS/DNS): $(dc logs --tail 5 caddy 2>&1 | tail -n 5)"
  return 1
}

# Switches web and api to a tag (images must already be pulled) and waits for health, first
# inside the stack, then through Caddy.
switch_to() {
  local tag="$1"
  FORGE_TAG="$tag" dc up -d --no-build --remove-orphans caddy web api postgres redis runner-redis
  FORGE_TAG="$tag" wait_healthy "$tag" && FORGE_TAG="$tag" wait_edge "$tag"
}

record_release() {
  local tag="$1" cur
  mkdir -p "$FORGE_STATE_DIR"
  cur="$(current_tag)"
  if [[ -n "$cur" && "$cur" != "$tag" ]]; then echo "$cur" >"$FORGE_STATE_DIR/previous"; fi
  echo "$tag" >"$FORGE_STATE_DIR/current"
  echo "$(date -u +%FT%TZ) $tag ${2:-deploy}" >>"$FORGE_STATE_DIR/releases.log"
}
