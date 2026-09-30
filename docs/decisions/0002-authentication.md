# 0002 — Authentication and accounts (phase L2)

Date: 2026-09-30 · Status: accepted

## Sessions

- Random 256-bit token in an `HttpOnly; Secure; SameSite=Lax` cookie (`forge_session`). The database
  stores only `sha256(token)`, so a database leak does not leak usable sessions.
- 30-day expiry; `lastSeenAt` is touched at most every 5 minutes.
- Rotated on login, 2FA verification, 2FA enable and password change. Password change, password reset,
  2FA enable and role changes revoke other sessions.
- Password logins for accounts with TOTP get a **pending** session (10-minute expiry,
  `twoFactorVerified=false`) that can only call `POST /auth/2fa/verify`.

## CSRF

Signed double-submit token: the `forge_csrf` cookie holds `random.hmac(APP_SECRET, random)` and every
non-GET request must echo it in `x-csrf-token`. Unsigned values are rejected (protects against cookie
injection from sibling subdomains). Requests with an `Origin` header other than the web or API origin
are rejected. `SameSite=Lax` is the first line of defence. Signature-authenticated machine endpoints
(Stripe webhooks, runner callbacks) opt out with `@SkipCsrf()`.

## Secure defaults in the API

Every route requires a session unless marked `@Public()`. Global guards run in this order:
rate limit → CSRF → authentication/roles. Admin routes (`@Roles(...)`) also require TOTP 2FA to be on.
Responses pass through the route's zod schema, which strips unknown keys.

## Passwords

argon2id (19 MiB, t=2, p=1, OWASP). Minimum 10 characters. Rejected if present in the bundled list
(`apps/api/assets/common-passwords.txt.gz`: the NCSC top-100k list filtered to 10+ characters, 9,185
entries) or, when `HIBP_CHECK_ENABLED=true`, in Have I Been Pwned via the k-anonymity range API
(only 5 hex characters of the SHA-1 leave the server; failures fall back to the bundled list).
Unknown emails still run an argon2 verification so response time doesn't reveal account existence.

## Lockout

After 5 consecutive failures the account locks for 1, 2, 4 … minutes (max 60), even for the right
password. Plus per-IP limits: login 10 per 5 minutes, sign-up 10 per hour, password-reset request 5
per hour per account.

## OAuth

GitHub and Google with PKCE (S256) and a `state` stored in Redis for 10 minutes and bound to the
browser by an HttpOnly cookie scoped to `/api/v1/auth/oauth`. An OAuth identity links to an existing
account only when the provider reports the email as verified. Providers without credentials in the
environment are hidden.

## TOTP

Implemented in-house (`apps/api/src/auth/totp.ts`, ~80 lines) rather than adding a dependency; tested
against the RFC 6238 vectors. Secrets are encrypted with AES-256-GCM (`ENCRYPTION_KEY`). The last
accepted time step is stored so a code can never be replayed. 10 single-use recovery codes, stored as
sha256.

## Age check (needs a human decision)

Onboarding asks for a birth year only (spec section 4). We block anyone for whom
`currentYear - birthYear < 16`, which admits people who turn 16 later this calendar year. A stricter
rule (`< 17`) would block some 16-year-olds. **Confirm with your lawyer which rule to use.** The birth
year is not stored when the check fails.

## Account deletion

`POST /me/delete` signs out everywhere and schedules deletion. Signing in within 30 days allows
"Keep my account". After 30 days an hourly job scrubs personal data and deletes credentials, keeping
an anonymous tombstone row so foreign keys and aggregate statistics stay valid. Backups roll off after
a further 30 days (spec 3.5). The job moves to BullMQ with the other scheduled jobs in a later phase.

## Sign-up and account enumeration

Sign-up returns `409 CONFLICT` for an existing email (better UX; common practice). Login and password
reset do not reveal whether an account exists. Sign-up is rate-limited per IP to make enumeration slow.

## Dependencies added

`argon2` (spec names argon2id), `nodemailer` (SMTP transport behind the email interface).

## Test-only behaviour

`x-test-ip` is honoured only when `NODE_ENV=test`, so tests can simulate clients on different IPs.
