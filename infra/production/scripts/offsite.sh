#!/usr/bin/env bash
# Copies new backups to offsite object storage (another provider or region, still in the EU).
# Uses rclone with a remote the owner configures once: `rclone config` → name it forge-offsite.
# Runs on the host after backup.sh (systemd ExecStartPost). Never deletes remotely: the bucket's
# lifecycle rule expires objects after 30 days, so a compromised VM can't wipe the history if the
# rclone key is write-only (no delete permission).
source "$(dirname "$0")/lib.sh"
BACKUP_DIR="${BACKUP_DIR:-/var/backups/forge}"
REMOTE="${FORGE_OFFSITE_REMOTE:-forge-offsite:forge-backups}"
command -v rclone >/dev/null || die "rclone is not installed"
rclone copy --max-age 48h --immutable --no-traverse "$BACKUP_DIR" "$REMOTE"
log "offsite copy ok -> $REMOTE"
