#!/usr/bin/env bash
# Rolls web + api back to the previous release (or a given tag). Usage: rollback.sh [tag]
# The database is NOT rolled back: migrations are expand-only, so the previous release runs on
# the new schema. To undo data changes, restore a backup (docs/runbooks/restore-backup.md).
source "$(dirname "$0")/lib.sh"

check_env_file
TARGET="${1:-$(previous_tag)}"
[[ -n "$TARGET" ]] || die "no previous release recorded; pass a tag"
[[ "$TARGET" =~ ^[A-Za-z0-9._-]+$ ]] || die "bad tag"
CUR="$(current_tag)"
log "rolling back ${CUR:-?} -> $TARGET"
export FORGE_TAG="$TARGET"
if [[ -z "${FORGE_SKIP_PULL:-}" ]]; then dc pull --quiet web api; fi
switch_to "$TARGET" || die "rollback target $TARGET is not healthy either"
record_release "$TARGET" rollback
log "now running $TARGET"
