# Runbook: rollback

Use when a release is live and misbehaving (errors, broken flow), and a fix isn't minutes away.

```bash
sudo /opt/forge/infra/production/scripts/rollback.sh          # back to the previous release
sudo /opt/forge/infra/production/scripts/rollback.sh v2026.9.3 # or to a specific tag
```

- Switches web and API to the older images and waits for `/health` to report that version.
- **The database is not rolled back.** Migrations are expand-only (deploy.md), so the older
  release runs on the newer schema. If bad data was written, also follow restore-backup.md, and
  prefer a targeted fix over a full restore (a restore loses everything since the backup).
- Release history: `/var/lib/forge/releases.log`; current and previous: `/var/lib/forge/current`,
  `/var/lib/forge/previous`.
- `deploy.sh` already rolls back by itself when a new version never becomes healthy.
- Runner VMs: `install.sh` keeps the last 3 releases in `/opt/forge-runner/releases/`. To go back,
  re-run `install.sh` with the older `FORGE_TAG`.

After a rollback: open an incident note (what broke, when, impact), fix forward on `main`, and
release a new tag. Don't re-deploy the bad tag.
