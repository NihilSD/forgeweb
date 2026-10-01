#!/usr/bin/env bash
# Deploys a release tag to the app VM. Usage: deploy.sh <tag>   (tag = image tag built by CI)
#
#   1. pre-flight (env file, compose config, images pullable)
#   2. encrypted backup of the database
#   3. migrations (expand-only, see docs/runbooks/deploy.md), content import
#   4. switch web + api, wait for /health to report the new version
#   5. on failure: switch back to the previous release automatically
source "$(dirname "$0")/lib.sh"

TAG="${1:-}"
[[ "$TAG" =~ ^[A-Za-z0-9._-]+$ ]] || die "usage: deploy.sh <image-tag>"
check_env_file
export FORGE_TAG="$TAG"
PREV="$(current_tag)"
log "deploying $TAG (current: ${PREV:-none})"

dc config --quiet
if [[ -z "${FORGE_SKIP_PULL:-}" ]]; then
  dc --profile tools pull --quiet web api tools
fi

dc up -d postgres redis runner-redis
# Wait for Postgres (the healthcheck) before anything touches it.
for _ in $(seq 60); do dc exec -T postgres pg_isready -U forge -d forge >/dev/null 2>&1 && break; sleep 2; done
if [[ -n "$PREV" ]]; then
  log "pre-deploy backup"
  dc run --rm backup
fi

log "migrations"
dc run --rm tools
log "content import"
dc run --rm -w /tools/api tools node dist/cli/import-problems.js --no-validate --root /tools/api/content/problems
if [[ -z "$PREV" ]]; then
  log "first backup (records the backup time for monitoring)"
  dc run --rm backup
fi

if switch_to "$TAG"; then
  record_release "$TAG" deploy
  log "deployed $TAG"
  exit 0
fi

if [[ -n "$PREV" ]]; then
  log "deploy failed; rolling back to $PREV"
  if switch_to "$PREV"; then
    echo "$(date -u +%FT%TZ) $PREV auto-rollback-from-$TAG" >>"$FORGE_STATE_DIR/releases.log"
    die "deploy of $TAG failed; running $PREV again"
  fi
fi
die "deploy of $TAG failed and no healthy previous release; see docker compose logs api web"
