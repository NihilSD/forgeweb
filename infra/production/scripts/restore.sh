#!/usr/bin/env bash
# Restores a backup INTO PRODUCTION. Destructive: replaces the whole database.
#   restore.sh <backup.dump.gpg> <private-key.asc> --yes-replace-production
# Follow docs/runbooks/restore-backup.md; run restore-test.sh on the same file first.
source "$(dirname "$0")/lib.sh"
FILE="${1:?usage: restore.sh <backup.dump.gpg> <private-key.asc> --yes-replace-production}"
KEY="${2:?private key file required}"
[[ "${3:-}" == "--yes-replace-production" ]] || die "refusing without --yes-replace-production"
check_env_file
FORGE_TAG="$(current_tag)"
export FORGE_TAG="${FORGE_TAG:-unknown}"

log "pre-restore safety backup of the current database"
dc run --rm backup || log "WARNING: safety backup failed (continuing: the database may be broken)"

# Decrypt fully into the postgres container first: GPG checks integrity only at the end, and a
# damaged file must be rejected before the live database is touched.
log "decrypting $(basename "$FILE")"
PASS_ARGS=()
[[ -n "${GPG_PASSPHRASE_FILE:-}" ]] && PASS_ARGS=(-v "$(realpath "$GPG_PASSPHRASE_FILE"):/pass:ro")
docker run --rm -i --network none -v "$(realpath "$KEY"):/key.asc:ro" "${PASS_ARGS[@]}" \
  "${POSTGRES_IMAGE:-postgres:17-bookworm}" bash -c '
  set -euo pipefail
  export GNUPGHOME="$(mktemp -d)"
  extra=()
  [[ -f /pass ]] && extra=(--pinentry-mode loopback --passphrase-file /pass)
  gpg --batch --quiet "${extra[@]}" --import /key.asc 2>/dev/null
  gpg --batch --quiet "${extra[@]}" --decrypt' <"$FILE" \
  | dc exec -T postgres sh -c 'umask 077; cat > /tmp/restore.dump' \
  || die "could not decrypt $(basename "$FILE"); production untouched"
dc exec -T postgres pg_restore --list /tmp/restore.dump >/dev/null || die "not a valid dump; production untouched"

log "stopping web and api"
dc stop web api
log "recreating database"
dc exec -T postgres psql -U forge -d postgres -v ON_ERROR_STOP=1 \
  -c "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = 'forge' AND pid <> pg_backend_pid();" \
  -c 'DROP DATABASE forge;' -c 'CREATE DATABASE forge OWNER forge;'
dc exec -T postgres pg_restore -U forge -d forge --no-owner --exit-on-error /tmp/restore.dump
dc exec -T postgres rm -f /tmp/restore.dump

log "starting web and api"
switch_to "$FORGE_TAG" || die "app did not become healthy after restore; check logs"
log "restore complete from $(basename "$FILE")"
