#!/usr/bin/env bash
# Runs inside the `backup` service (postgres:17 image): an encrypted custom-format dump.
# Encryption is to the owner's GPG public key; the matching private key never lives on this VM,
# so a compromised server cannot read old backups. Spec 3.3: daily, kept 30 days.
set -euo pipefail
umask 077
: "${BACKUP_DIR:?}" "${BACKUP_RECIPIENT_FILE:?}"
KEEP_DAYS="${BACKUP_KEEP_DAYS:-30}"
STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
NOW="$(date -u +%s)"
OUT="$BACKUP_DIR/forge-$STAMP.dump.gpg"
export GNUPGHOME="$(mktemp -d)"
trap 'rm -rf "$GNUPGHOME" "$OUT.partial"' EXIT

[[ -s "$BACKUP_RECIPIENT_FILE" ]] || { echo "backup public key missing" >&2; exit 1; }

# Row counts for the restore test to compare against (counts only, no personal data).
counts() {
  psql -XAt -v ON_ERROR_STOP=1 -c "
    SELECT json_build_object(
      'migrations', (SELECT count(*) FROM _prisma_migrations WHERE finished_at IS NOT NULL),
      'users', (SELECT count(*) FROM \"User\"),
      'problems', (SELECT count(*) FROM \"Problem\"),
      'submissions', (SELECT count(*) FROM \"Submission\"),
      'tables', (SELECT count(*) FROM information_schema.tables WHERE table_schema = 'public'))"
}

# Counts and dump come from one snapshot: pg_dump's own transaction is separate, so counts are
# taken right before and the restore test allows rows created in between (>=).
COUNTS="$(counts)"
pg_dump --format=custom --compress=6 --no-owner --no-privileges \
  | gpg --batch --yes --trust-model always --recipient-file "$BACKUP_RECIPIENT_FILE" \
      --compress-algo none --cipher-algo AES256 --encrypt --output "$OUT.partial"
mv "$OUT.partial" "$OUT"
sha256sum "$OUT" | sed "s#$BACKUP_DIR/##" >"$OUT.sha256"
printf '%s\n' "$COUNTS" >"$BACKUP_DIR/forge-$STAMP.manifest.json"

# Local retention; the offsite bucket has its own 30-day lifecycle rule.
find "$BACKUP_DIR" -maxdepth 1 -name 'forge-*' -mtime "+$KEEP_DAYS" -delete

# Tell the API's monitoring (backups-stale alert) via the main Redis. Plain RESP over bash's
# /dev/tcp: this image has no redis-cli.
if [[ -n "${REDIS_HOST:-}" ]]; then
  exec 3<>"/dev/tcp/$REDIS_HOST/${REDIS_PORT:-6379}"
  printf '*3\r\n$3\r\nSET\r\n$22\r\nmonitoring:last-backup\r\n$%d\r\n%s\r\n' "${#NOW}" "$NOW" >&3
  read -r -t 5 reply <&3 || reply=""
  exec 3>&-
  [[ "$reply" == "+OK"* ]] || echo "warning: could not record the backup time in Redis" >&2
fi
echo "backup ok: $(basename "$OUT") $(stat -c %s "$OUT") bytes $COUNTS"
