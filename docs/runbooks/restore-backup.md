# Runbook: backups and restore

Spec 3.3: daily encrypted backups, kept 30 days, with a tested restore.

## How backups work

- `forge-backup.timer` runs nightly at ~02:17 UTC: `pg_dump` (custom format) piped into GPG
  encryption to the **public** backup key → `/var/backups/forge/forge-<time>.dump.gpg`, plus a
  `.sha256` and a `.manifest.json` with row counts (no personal data).
- `offsite.sh` then copies new files to the `forge-offsite` rclone remote (another EU location).
  The bucket's lifecycle rule deletes them after 30 days; locally, files older than 30 days are
  deleted by the backup itself. Deleted accounts therefore leave backups within 30 more days
  (privacy policy).
- `deploy.sh` also takes a backup before every migration.
- Monitoring alerts **backups-stale** if no backup succeeded in 26 hours, and the systemd
  `OnFailure` hook posts to `ALERT_WEBHOOK_URL` when the job fails.

## Monthly restore test (required)

On the machine that holds the private key (with Docker):

```bash
rclone copy forge-offsite:forge-backups/forge-<time>.dump.gpg .   # plus .sha256 and .manifest.json
GPG_PASSPHRASE_FILE=~/forge-backup-pass infra/production/scripts/restore-test.sh \
  forge-<time>.dump.gpg ~/forge-backup-private.asc
```

It restores into a throwaway Postgres with no network and compares migrations, table count and
row counts with the manifest. It must end with `RESTORE TEST PASSED`. Note the date and file in
`docs/restore-tests.md`.

## Restoring production (data loss or corruption)

1. Decide the point in time. Everything after that backup is lost (tell users if accounts or
   payments are affected; Stripe stays the source of truth for billing and re-syncs by webhook).
2. Run `restore-test.sh` on the chosen file first.
3. Copy the backup and the private key to the VM **temporarily** (`/root/restore/`, mode 600).
4. ```bash
   sudo GPG_PASSPHRASE_FILE=/root/restore/pass /opt/forge/infra/production/scripts/restore.sh \
     /root/restore/forge-<time>.dump.gpg /root/restore/private.asc --yes-replace-production
   ```
   It takes a safety backup of the current database, stops web and API, recreates the database,
   restores, and starts the app again.
5. `shred -u /root/restore/*`. The private key must not stay on the server.
6. Check `/status`, sign in, open a problem; check the Stripe dashboard for subscriptions changed
   since the backup (replay webhooks from the Stripe dashboard if needed).
