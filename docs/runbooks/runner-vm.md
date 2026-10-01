# Runbook: runner VM

**Automated:** `infra/runner/install.sh` does sections 2–6 below (Docker, gVisor, firewall,
service user, runner bundle from the `forge-runner` image, sandbox images, systemd unit). Read
this page to know what it does; then do §7 by hand.

Runner hosts execute code written by strangers. Treat them as hostile: separate VMs, separate
network, nothing valuable on them.

## 1. Provision

- A dedicated VM in the EU region (start: 4 vCPU, 8 GB RAM, 40 GB disk). No other services on it.
- Ubuntu LTS, unattended security upgrades on, SSH by key only, no password login.
- No cloud credentials: no instance role / metadata credentials. Block the metadata endpoint:
  `iptables -I OUTPUT -d 169.254.169.254 -j DROP` (persist it).

## 2. Firewall (default deny)

Inbound: SSH from your admin IP only. Nothing else; the runner opens no ports.

Outbound, allow only:

| Destination             | Port                    | Why                                               |
| ----------------------- | ----------------------- | ------------------------------------------------- |
| Job Redis (private IP)  | 6379 (TLS if available) | pull jobs                                         |
| API callback host       | 443                     | post signed results                               |
| Your container registry | 443                     | pull sandbox images (can be closed after pulling) |
| OS package mirrors      | 443                     | security updates                                  |

Everything else is dropped. Sandboxes additionally run with `--network none`.

## 3. Install Docker and gVisor

```bash
# Docker Engine from docker.com's apt repository, then:
curl -fsSL https://gvisor.dev/archive.key | sudo gpg --dearmor -o /usr/share/keyrings/gvisor-archive-keyring.gpg
echo "deb [arch=$(dpkg --print-architecture) signed-by=/usr/share/keyrings/gvisor-archive-keyring.gpg] https://storage.googleapis.com/gvisor/releases release main" | sudo tee /etc/apt/sources.list.d/gvisor.list
sudo apt-get update && sudo apt-get install -y runsc
sudo runsc install        # registers the runsc runtime with Docker
sudo systemctl restart docker
docker run --rm --runtime=runsc hello-world   # must succeed
```

The runner refuses to start in production with any runtime other than `runsc`.

## 4. Sandbox images

Build them in CI from `sandboxes/` (base images pinned by digest), push to your registry, and pull
by digest on the VM. Set `RUNNER_IMAGE_PYTHON`, `RUNNER_IMAGE_NODE`, `RUNNER_IMAGE_SQL` to
`registry/forge-sandbox-…@sha256:…`.

## 5. Secrets (the only three)

Put these in the host's secret store or a root-only `/etc/forge/runner.env` (mode 600):

```
NODE_ENV=production
RUNNER_ID=runner-1
RUNNER_REDIS_URL=rediss://runner:<password>@<job-redis>:6379/0
RUNNER_JOB_SIGNING_KEYS=<keyId>:<secret>[,<oldKeyId>:<oldSecret>]
RUNNER_CALLBACK_KEYS=<keyId>:<secret>[,<oldKeyId>:<oldSecret>]
RUNNER_CALLBACK_URL=https://api.<your-domain>/api/v1/internal/runner/callback
RUNNER_RUNTIME=runsc
RUNNER_CONCURRENCY=4
```

No database URL, no main Redis, no Stripe or email keys.

### Restricted Redis user (on the job Redis)

```
ACL SETUSER runner on ><password> ~bull:forge-runs:* &* +@all -@admin -@dangerous -keys -flushdb -flushall +keys
```

Also allow `runner:heartbeat:*` keys (`~runner:heartbeat:*`). Test that the user can't read other
key prefixes.

## 6. Run the service

Run `node apps/runner/dist/main.js` under systemd as an unprivileged user in the `docker` group
(`Restart=always`, `EnvironmentFile=/etc/forge/runner.env`). Membership in `docker` is root-equivalent
on this host, which is acceptable only because the VM holds nothing else.

## 7. Verify before taking traffic

```bash
RUNNER_RUNTIME=runsc REQUIRE_DOCKER=1 pnpm --filter @forge/runner test      # attack + verdict suites
RUN_LOAD_TEST=1 RUNNER_RUNTIME=runsc pnpm --filter @forge/runner test:load   # 100 runs, median < 2s
```

Both must pass on the VM with gVisor. Record the output in `docs/SECURITY_REVIEW.md`.

## 8. Key rotation

1. Add the new key first in the list on the API (`newId:newSecret,oldId:oldSecret`) and the runner.
2. Deploy both. The first key signs; every listed key verifies.
3. After 15 minutes (the job and callback age limits), remove the old key and deploy again.

## Incident: runner misbehaving or compromised

Stop the service, snapshot the disk for forensics, destroy the VM, rotate both HMAC key sets and the
Redis password, then rebuild from this runbook. Submissions left queued show as Internal Error, are
retried once and never count against users.
