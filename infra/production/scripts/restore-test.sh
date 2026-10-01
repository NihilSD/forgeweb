#!/usr/bin/env bash
# Proves a backup can be restored. Restores into a throwaway Postgres container (no network,
# nothing touches production) and compares row counts with the backup's manifest.
#
#   restore-test.sh <backup.dump.gpg> <private-key.asc>
#
# Run it where the private key lives (your machine, or a separate restore host), at least
# monthly and after every schema-heavy release. Needs Docker. GPG asks for the key passphrase
# unless GPG_PASSPHRASE_FILE is set.
set -euo pipefail
FILE="${1:?usage: restore-test.sh <backup.dump.gpg> <private-key.asc>}"
KEY="${2:?usage: restore-test.sh <backup.dump.gpg> <private-key.asc>}"
IMAGE="${POSTGRES_IMAGE:-postgres:17-bookworm}"
DIR="$(cd "$(dirname "$FILE")" && pwd)"
BASE="$(basename "$FILE" .dump.gpg)"
MANIFEST="$DIR/$BASE.manifest.json"
NAME="forge-restore-test-$$"
log() { printf '%s %s\n' "$(date -u +%FT%TZ)" "$*" >&2; }

if [[ -f "$DIR/$BASE.dump.gpg.sha256" ]]; then
  (cd "$DIR" && sha256sum -c --quiet "$BASE.dump.gpg.sha256") || { log "checksum mismatch"; exit 1; }
  log "checksum ok"
fi

cleanup() { docker rm -f "$NAME" >/dev/null 2>&1 || true; }
trap cleanup EXIT
docker run -d --name "$NAME" --network none -e POSTGRES_PASSWORD=restore -e POSTGRES_USER=forge \
  -e POSTGRES_DB=forge "$IMAGE" >/dev/null
for _ in $(seq 60); do
  docker exec "$NAME" pg_isready -U forge -d forge >/dev/null 2>&1 && break
  sleep 1
done
# pg_isready can succeed during the init restart; wait for a real query.
for _ in $(seq 30); do
  docker exec "$NAME" psql -U forge -d forge -c 'select 1' >/dev/null 2>&1 && break
  sleep 1
done

PASS_ARGS=()
[[ -n "${GPG_PASSPHRASE_FILE:-}" ]] && PASS_ARGS=(-v "$(realpath "$GPG_PASSPHRASE_FILE"):/pass:ro")
log "decrypting $(basename "$FILE")"
# Decrypt completely (GPG verifies integrity only at the end) into the throwaway container, and
# restore only if that succeeded. Plaintext never touches this machine's disk.
docker run --rm -i --network none -v "$(realpath "$KEY"):/key.asc:ro" "${PASS_ARGS[@]}" "$IMAGE" bash -c '
  set -euo pipefail
  export GNUPGHOME="$(mktemp -d)"
  extra=()
  [[ -f /pass ]] && extra=(--pinentry-mode loopback --passphrase-file /pass)
  gpg --batch --quiet "${extra[@]}" --import /key.asc 2>/dev/null
  gpg --batch --quiet "${extra[@]}" --decrypt' <"$FILE" \
  | docker exec -i "$NAME" sh -c 'cat > /tmp/restore.dump' \
  || { log "RESTORE TEST FAILED: could not decrypt (wrong key, or the file is damaged)"; exit 1; }
log "restoring"
docker exec "$NAME" pg_restore -U forge -d forge --no-owner --exit-on-error /tmp/restore.dump \
  || { log "RESTORE TEST FAILED: pg_restore"; exit 1; }

ACTUAL="$(docker exec "$NAME" psql -U forge -d forge -XAt -c "
  SELECT json_build_object(
    'migrations', (SELECT count(*) FROM _prisma_migrations WHERE finished_at IS NOT NULL),
    'users', (SELECT count(*) FROM \"User\"),
    'problems', (SELECT count(*) FROM \"Problem\"),
    'submissions', (SELECT count(*) FROM \"Submission\"),
    'tables', (SELECT count(*) FROM information_schema.tables WHERE table_schema = 'public'))")"
log "restored counts: $ACTUAL"

if [[ -f "$MANIFEST" ]]; then
  EXPECTED="$(cat "$MANIFEST")"
  log "manifest counts: $EXPECTED"
  # Counts were taken just before the dump: restored values must be >= and migrations equal.
  docker run --rm -i --network none "$IMAGE" perl -MJSON::PP -e '
    my ($e, $a) = map { JSON::PP->new->decode($_) } @ARGV;
    die "migrations differ\n" if $e->{migrations} != $a->{migrations};
    die "tables differ\n" if $e->{tables} != $a->{tables};
    for (qw(users problems submissions)) { die "$_: $a->{$_} < $e->{$_}\n" if $a->{$_} < $e->{$_} }
  ' "$EXPECTED" "$ACTUAL" || { log "RESTORE TEST FAILED"; exit 1; }
else
  log "no manifest next to the backup; checked that the restore completed only"
fi
log "RESTORE TEST PASSED: $(basename "$FILE")"
