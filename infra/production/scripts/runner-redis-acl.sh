#!/usr/bin/env bash
# Writes /etc/forge/runner-redis.acl from the passwords in forge.env. Re-run after rotating them,
# then `docker compose restart runner-redis` (via scripts/lib.sh dc).
#   api    — the API: the runner queue, heartbeats (monitoring) and INFO (BullMQ).
#   runner — the runner VM: only the queue and its own heartbeat keys. No admin, no FLUSH*, no KEYS.
source "$(dirname "$0")/lib.sh"
check_env_file
RUNNER_REDIS_API_PASSWORD="$(env_get RUNNER_REDIS_API_PASSWORD)"
RUNNER_REDIS_RUNNER_PASSWORD="$(env_get RUNNER_REDIS_RUNNER_PASSWORD)"
[[ -n "$RUNNER_REDIS_API_PASSWORD" && -n "$RUNNER_REDIS_RUNNER_PASSWORD" ]] || die "set both RUNNER_REDIS_*_PASSWORD"
[[ "$RUNNER_REDIS_API_PASSWORD$RUNNER_REDIS_RUNNER_PASSWORD" =~ ^[A-Za-z0-9]+$ ]] || die "use hex passwords (openssl rand -hex 32)"
OUT="$(env_get RUNNER_REDIS_ACL)"
OUT="${OUT:-/etc/forge/runner-redis.acl}"
umask 077
cat >"$OUT" <<ACL
user default off
user api on >${RUNNER_REDIS_API_PASSWORD} ~bull:forge-runs:* ~runner:heartbeat:* &* +@all -@admin -@dangerous +info
user runner on >${RUNNER_REDIS_RUNNER_PASSWORD} ~bull:forge-runs:* ~runner:heartbeat:* &* +@all -@admin -@dangerous +info
ACL
# Redis runs as uid 999 in the container and must read the file.
chown 999:999 "$OUT" 2>/dev/null || chmod 644 "$OUT"
log "wrote $OUT"
