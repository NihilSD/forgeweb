# Runbook: deploy

Forge runs on one **app VM** (Docker Compose: Caddy, web, API, Postgres, Redis, job Redis) and one
or more **runner VMs** (systemd, gVisor). Everything is in an EU region. Files:
`infra/production/` (app VM), `infra/runner/` (runner VM), `infra/docker/Dockerfile` (images).

## First-time setup of the app VM

1. Ubuntu 24.04 LTS, 4 vCPU / 8 GB / 80 GB SSD to start. SSH by key only, unattended upgrades on.
2. Firewall (provider firewall **and** `ufw`): inbound 22 from your IP only, 80 and 443 from
   anywhere, 6380 from the runner VM's **private** IP only. Everything else closed.
3. Install Docker Engine (docker.com apt repository) and `rclone`.
4. `git clone https://github.com/<you>/forge /opt/forge` (infra files only are used from it).
5. Secrets: `install -m 600 /dev/null /etc/forge/forge.env`, then fill it from
   `infra/production/forge.env.example`. Generate every secret **on the server**
   (`openssl rand …`); never paste them into chat, tickets or git.
6. Backup key: on **your own machine**, `gpg --quick-gen-key "Forge backups" rsa4096 encr never`,
   export the public key to `/etc/forge/backup-public.asc` on the VM. Keep the private key and its
   passphrase offline (password manager + a printed copy). The VM never sees the private key.
7. `sudo /opt/forge/infra/production/scripts/runner-redis-acl.sh`
8. `mkdir -p /var/backups/forge /var/lib/forge`
9. `rclone config` → remote `forge-offsite` (S3-compatible bucket in another EU location, a key
   that can write but not delete), and a bucket lifecycle rule that deletes objects after 30 days.
10. Systemd: copy `infra/production/systemd/*` to `/etc/systemd/system/`, then
    `systemctl daemon-reload && systemctl enable --now forge-backup.timer`.
11. DNS: `A`/`AAAA` for the domain and `www` → the VM. Caddy gets certificates on first start.
12. Log in to the registry once: `docker login ghcr.io` with a read-only (packages:read) token.

## Release

1. Merge to `main`; wait for CI to be green.
2. Tag the commit: `git tag v2026.10.1 && git push origin v2026.10.1`. The **Release images**
   workflow pushes `forge-{api,web,tools,runner}:<tag>` to GHCR.
3. On the app VM:
   ```bash
   cd /opt/forge && git fetch --tags && git checkout <tag>   # infra files match the images
   sudo infra/production/scripts/deploy.sh <tag>
   ```
   The script: pulls the images → takes an encrypted backup → runs migrations → imports content →
   switches web and API → waits until `/api/v1/health` reports the new version. If the new
   version doesn't become healthy in 2 minutes it **switches back automatically** and exits 1.
4. If the runner code changed (`apps/runner`, `packages/problem-kit`, `sandboxes/`), upgrade each
   runner VM: `sudo FORGE_TAG=<tag> … infra/runner/install.sh` (see runner-vm.md).
5. Check: `https://<domain>/status` shows everything working; run one problem end to end.

## One-off commands

```bash
source /opt/forge/infra/production/scripts/lib.sh
export FORGE_TAG="$(current_tag)"
dc run --rm tools                                    # prisma migrate deploy
dc run --rm -w /tools/api tools node dist/cli/grant-role.js --email you@example.com --role superadmin
dc run --rm -w /tools/api tools node dist/cli/purge-replays.js
dc run --rm backup                                   # an extra backup now
```

## Migrations: expand only

Rollback swaps images but never the schema, so every migration must work with the **previous**
release too:

- Add columns as nullable or with a default; add tables freely.
- Renames and drops happen in two releases: (1) add new + write both, (2) after one release, drop
  the old one.
- Never edit a migration that has run in production.

## Logs

`docker compose logs` (via `source infra/production/scripts/lib.sh; dc logs -f api`). JSON
logs are rotated (10 × 20 MB per container). Caddy access logs drop cookies, auth headers and
query tokens. The API never logs passwords, tokens, session IDs, full emails or verified-attempt
code (CLAUDE.md).
