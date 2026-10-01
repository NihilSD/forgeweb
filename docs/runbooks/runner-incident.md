# Runbook: runner incident

Alerts: **runners-down** (no heartbeat for 30 s) and **submission-backlog** (a submission has
waited more than 2 minutes). Users see runs stay "queued"; verified attempts keep their timers,
and a queued submission that fails is retried once and never counts against the user.

## Runner down

1. `ssh runner-1` → `systemctl status forge-runner` and `journalctl -u forge-runner -n 200`.
2. Common causes:
   - Docker or gVisor broken after an upgrade: `docker run --rm --runtime=runsc hello-world`.
     Fix, then `systemctl restart forge-runner`.
   - Can't reach the job Redis: check the private network, the app VM firewall (6380 from the
     runner's private IP) and that `RUNNER_REDIS_URL` matches the `runner` ACL password.
   - Wrong signing keys after a rotation: logs show signature errors; fix `runner.env`.
   - Disk full: `docker system prune -f` (sandbox images stay pinned), check `/var/lib/forge-runner/work`.
3. The alert resolves by itself (RESOLVED message) when a heartbeat arrives.

## Backlog with runners up

Load is above capacity. Raise `RUNNER_CONCURRENCY` (max one per vCPU) or add a runner VM: run
`install.sh` with a new `RUNNER_ID`. Check `forge_runner_queue_waiting` on the metrics endpoint.

## Suspected sandbox escape or compromise

Treat it as real until proven otherwise.

1. Stop the runner: `systemctl stop forge-runner` (jobs stay queued).
2. Snapshot the VM disk at the provider (forensics), then **destroy** the VM. Don't clean it.
3. Rotate the runner HMAC keys and both job Redis passwords (rotate-keys.md). The runner holds
   nothing else: no database, Stripe or email credentials.
4. Rebuild from runner-vm.md with a fresh VM, run the attack suite (§7) before taking traffic.
5. Find the submission: the job id is in the runner log; look up the user and code in the admin
   panel. Suspend the account, keep the evidence, and follow the security contact process.
6. Write it up in `docs/SECURITY_REVIEW.md`; check gVisor and Docker advisories.

## Verify the alert path (do this at launch and after alert changes)

```bash
ssh runner-1 sudo systemctl stop forge-runner
# within ~90 s: "[Forge] FIRING: runners-down" arrives by email / webhook
ssh runner-1 sudo systemctl start forge-runner
# within ~60 s: "[Forge] RESOLVED: runners-down"
```
