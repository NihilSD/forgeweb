# Runbook: monitoring and alerts

| Signal            | Where                                                                     | Alert                          |
| ----------------- | ------------------------------------------------------------------------- | ------------------------------ |
| Site up           | External uptime monitor on `/api/v1/health` and `/status` (owner sets up) | Your uptime service            |
| Runner heartbeats | API `MonitoringService`, every minute                                     | `runners-down` (none in 30 s)  |
| Queue backlog     | Oldest `queued` submission                                                | `submission-backlog` (> 2 min) |
| Stripe webhooks   | `WebhookEvent` rows still `failed` after 15 min                           | `webhooks-failing`             |
| API errors        | Unexpected 500s counted per minute in Redis                               | `api-errors` (≥ 10 in 5 min)   |
| Backups           | `monitoring:last-backup`, set by `backup.sh`                              | `backups-stale` (> 26 h)       |
| Host backup job   | systemd `OnFailure=forge-alert@`                                          | webhook only                   |

Alerts are sent **once when a problem starts and once when it clears** (`[Forge] FIRING: …` /
`[Forge] RESOLVED: …`), to `ALERT_EMAIL` and to `ALERT_WEBHOOK_URL` as JSON `{title, text}`
(ntfy and Slack accept that). They contain counts only, never user data. State lives in Redis
(`monitoring:alert:*`), so several API instances send one alert.

## Public status page

`/status` (page) and `/api/v1/status` (JSON): API, database and runners as working/down. No
hostnames, versions or counts.

## Metrics

`GET /api/v1/internal/metrics` with `Authorization: Bearer $METRICS_TOKEN` returns Prometheus text:
runner, queue, webhook, error and backup gauges, plus **product analytics as aggregate counts**
(users, sign-ups and active users in 24 h, submissions in 24 h, Pro subscriptions). Caddy blocks
this path from the internet; scrape it from the VM:

```bash
source /opt/forge/infra/production/scripts/lib.sh
dc exec -T web node -e "fetch('http://api:4000/api/v1/internal/metrics',{headers:{authorization:'Bearer '+process.argv[1]}}).then(r=>r.text()).then(console.log)" "$(env_get METRICS_TOKEN)"
```

To use a hosted scraper instead, remove the `@metrics` block from the Caddyfile (the token still
protects the endpoint).

## Logs

`dc logs -f --since 1h api` (also `web`, `caddy`, `postgres`). JSON-file driver, 10 × 20 MB per
container. Stack traces of unexpected errors are in the API log; search for `ErrorFilter`.
