# Launch checklist: the steps only you can do

In order. Each step says where the details are. Everything that could be automated is already in
the repository: deploy, rollback, backups, restore test, monitoring, runner install. What's left
needs your accounts, money, legal identity or judgement. Tick the boxes as you go.

## A. Decisions and approvals (before spending money)

1. [ ] **Approve content.** Nothing is published in production until `review: approved`: today all
       41 problems, the 4 courses and the placement quiz are drafts, so the live library would be
       **empty**. Work through `docs/content-batches.md` with the checklist in
       `docs/content-style.md`, set `review: approved`, bump `version`, merge.
2. [ ] **Legal.** Have a lawyer review `/legal/privacy`, `/legal/terms`, `/legal/cookies`,
       `/legal/acceptable-use` (drafts in `apps/web/src/app/legal/[doc]/docs.ts`). Fill in the
       company name, address and registration number. Confirm the minimum age of 16 (ADR 0002).
3. [ ] **Integrity weights.** Review `apps/api/src/integrity/integrity.config.ts` against
       `docs/decisions/integrity-score.md` before verified results matter to employers.
4. [ ] **Choose a domain** and a security contact address (`security@<domain>`).
5. [ ] **Optional decisions:** hosted error tracking (e.g. Sentry EU) on top of the built-in 5xx
       alerts; keep or tighten `style-src 'unsafe-inline'` (SECURITY_REVIEW.md).

## B. Accounts

6. [ ] **Hosting in an EU region**: one app VM (4 vCPU / 8 GB / 80 GB) and one runner VM
       (4 vCPU / 8 GB / 40 GB) on the same **private network**, plus an S3-compatible bucket in a
       _different_ EU location for offsite backups.
7. [ ] **Transactional email provider** (EU region). Get SMTP credentials for `SMTP_URL`.
8. [ ] **Stripe**: business verification, bank account, Stripe Tax and OSS VAT registration.
       Follow `docs/runbooks/stripe.md` in **live mode** (product, four prices, restricted key,
       Customer Portal, failed-payment settings, webhook endpoint
       `https://<domain>/api/v1/billing/webhook`).
9. [ ] **OAuth apps** (optional): GitHub and Google, callback URLs
       `https://<domain>/api/v1/auth/oauth/<provider>/callback`.
10. [ ] **Alerts**: an ntfy topic, Slack incoming webhook or similar for `ALERT_WEBHOOK_URL`
        (backup failures on the host only go to the webhook), plus `ALERT_EMAIL`.
11. [ ] **Uptime monitor** outside your hosting provider (EU-based service), checking
        `https://<domain>/api/v1/health` and `https://<domain>/status` every minute.

## C. DNS and email domain

12. [ ] `A`/`AAAA` records for `<domain>` and `www.<domain>` → app VM.
13. [ ] Email authentication for the sending domain, from your email provider's instructions:
        **SPF** (`v=spf1 include:<provider> -all`), **DKIM** (their CNAME/TXT records) and
        **DMARC** (`_dmarc` TXT, start with `v=DMARC1; p=quarantine; rua=mailto:dmarc@<domain>`).
        Check with a mail-tester service: one-click unsubscribe headers only work when DKIM
        passes.

## D. Servers

14. [ ] **Backup key, on your own computer**:
        `gpg --quick-gen-key "Forge backups" rsa4096 encr never`; keep the private key and its
        passphrase offline (password manager + paper). Only the public key goes to the server.
15. [ ] **App VM**: follow `docs/runbooks/deploy.md` → "First-time setup" (firewall, Docker,
        `/etc/forge/forge.env` from `infra/production/forge.env.example` with secrets generated on
        the server, backup public key, `runner-redis-acl.sh`, rclone remote, systemd timer).
16. [ ] **GitHub**: allow GitHub Actions to publish packages; create a read-only (packages:read)
        token for the VM's `docker login ghcr.io`. Add `STAGING_URL` as a repository variable if
        you keep a staging copy for ZAP.
17. [ ] **First release**: tag a green `main` commit (`git tag v2026.10.0 && git push --tags`),
        wait for **Release images**, then `sudo infra/production/scripts/deploy.sh v2026.10.0`.
18. [ ] **First admin**: sign up on the site, then on the VM:
        `dc run --rm -w /tools/api tools node dist/cli/grant-role.js --email <you> --role superadmin`
        (source `scripts/lib.sh` for `dc`). Sign in again and enrol two-factor authentication in
        Settings → Security; the admin panel needs it.
19. [ ] **Runner VM**: `/etc/forge/runner.env` from `infra/runner/runner.env.example`, then
        `infra/runner/install.sh` (docs/runbooks/runner-vm.md). Then run the **attack suite and the
        load test with gVisor** on the VM (runner-vm.md §7) and record the output in
        `docs/SECURITY_REVIEW.md`.

## E. Prove it works (spec L13 acceptance, on the real servers)

20. [ ] **Alerts**: stop the runner (`systemctl stop forge-runner`). Within ~90 s a
        `FIRING: runners-down` message must reach you; start it and receive `RESOLVED`
        (runner-incident.md).
21. [ ] **Deploy and rollback**: deploy a second tag, then `rollback.sh`, then deploy again.
22. [ ] **Backup restore**: the next morning, download a backup from the offsite bucket and run
        `restore-test.sh` on your computer until it prints `RESTORE TEST PASSED`
        (restore-backup.md). Put a monthly reminder in your calendar.
23. [ ] **Payments**: buy Pro with a real card in live mode, check the plan switches, then refund
        and cancel in the Stripe dashboard and check it switches back.
24. [ ] **Security scans against the live site**: run the ZAP baseline workflow with `STAGING_URL`
        set to a staging copy (or the site before launch), and the k6 scripts in `infra/load`
        against staging, not production.

## F. Launch

25. [ ] **Soft launch** to a small invited group. Watch `/status`, alerts and the logs for a
        week; fix what they find.
26. [ ] **Public launch.**
27. [ ] **Recurring:** monthly restore test; rotate keys yearly or when someone leaves
        (rotate-keys.md); update the VMs (unattended upgrades cover security patches; reboot
        monthly); review `pnpm audit` alerts from CI.
