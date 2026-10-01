/**
 * Legal drafts (phase L12) for the owner's lawyer to check. Facts here must match the code:
 * cookies, retention periods, processors and age limits. Placeholders are in [BRACKETS].
 */
export const DRAFT_NOTE =
  'Draft for legal review. Not yet in force. Placeholders in [brackets] are filled in before launch.';

export const LEGAL_DOCS: Record<string, { title: string; updated: string; body: string }> = {
  privacy: {
    title: 'Privacy policy',
    updated: '2026-10-01',
    body: `
Forge is run by **[COMPANY NAME]**, [ADDRESS], the controller for your personal data. Contact:
[PRIVACY EMAIL].

## What we collect and why

| Data | Why | Legal basis |
| --- | --- | --- |
| Account: email, password hash, display name, handle, country, time zone, birth year, goal, languages | Run your account, apply the minimum age, show the right prices and time zone | Contract |
| Your work: code, drafts, notes, submissions, results, hints used, progress, XP, streaks | Provide the learning service | Contract |
| Verified challenges: editor changes, pastes (length and a hash of the first 200 characters), focus and full-screen changes, follow-up answers | Verify results; you consent each time | Consent |
| Billing: Stripe customer id, subscription status, invoices (kept by Stripe) | Take payments, meet tax law | Contract, legal obligation |
| Security: sessions, hashed IP addresses, audit logs | Protect accounts and the service | Legitimate interest |
| Weekly progress email preference | Send the email only if you opt in | Consent |

We do not use advertising or tracking cookies, do not sell personal data, and do not record your
webcam, microphone or screen.

## Where it is stored and who processes it

Data is stored in the EU. Processors: [HOSTING PROVIDER] (servers and backups, EU), Stripe
(payments; Stripe processes card data, we never see it), [EMAIL PROVIDER] (emails), GitHub and
Google only if you choose to sign in with them.

## How long we keep it

- Your account data: until you delete your account. Deletion completes within 30 days; backups
  roll off within 30 more.
- Verified-challenge replays: 12 months, unless you choose to keep a replay public.
- Invoices: as long as tax law requires, at Stripe.
- Security logs: [12] months.

## Your rights

You can access and export all your data (Settings → Data → Export), correct it, delete your account
(Settings → Data), object to or restrict processing, and withdraw consent at any time. You can
complain to your data protection authority ([AUTHORITY]).

## Children

Forge is for people aged 16 and over. Users under 18 are hidden from company search and can't
receive direct messages from strangers.
`,
  },
  terms: {
    title: 'Terms of service',
    updated: '2026-10-01',
    body: `
These terms are an agreement between you and **[COMPANY NAME]** about using Forge.

## Accounts

You must be at least 16. Keep your password safe; you are responsible for activity on your account.
One account per person.

## Plans and payment

Forge Free costs nothing. Forge Pro is billed monthly or yearly through Stripe, with VAT where it
applies. You can cancel at any time in Settings; Pro stays until the end of the period you paid for.
If a payment fails, Pro stays for 7 days while you update your payment method. [REFUND POLICY,
including the EU 14-day withdrawal right for digital services and how it is waived when you start
using Pro.]

## Fair play

Verified results must be your own work. Follow-up questions, session recording and the integrity
score exist to keep results trustworthy; a result can be reviewed by a person and appealed. Sharing
solutions to verified challenges, sharing flags, or using AI help during verified attempts can lead
to results being removed or the account being closed. See the [acceptable use policy](/legal/acceptable-use).

## Your content

You keep the rights to code and text you write. You give us the licence we need to store, run and
show it to you (and, for verified results, to the people you choose to share them with).

## Our content

Problems, lessons, hints, editorials and test data belong to [COMPANY NAME] or its authors. Don't
copy them out of Forge in bulk.

## Availability and liability

We work to keep Forge available but can't promise it never fails. [LIMITATION OF LIABILITY within
what consumer law allows.] [GOVERNING LAW AND COURTS.]

## Changes

We will tell you about material changes at least 30 days before they apply.
`,
  },
  cookies: {
    title: 'Cookie notice',
    updated: '2026-10-01',
    body: `
Forge uses **only essential cookies**. They are needed for the site to work, so there is no consent
banner. We use no analytics, advertising or tracking cookies.

| Cookie | Purpose | Lifetime |
| --- | --- | --- |
| \`forge_session\` | Keeps you signed in (HttpOnly, Secure, SameSite=Lax) | Until you sign out, up to 30 days |
| \`forge_csrf\` | Protects forms against cross-site request forgery | 30 days |
| \`forge_theme\` | Remembers dark or light theme | 1 year |
| \`forge_oauth_state\` | Protects GitHub and Google sign-in | 10 minutes |

The workspace may also remember pane sizes in your browser's local storage. Stripe sets its own
cookies on its checkout pages, which are covered by Stripe's privacy policy.
`,
  },
  'acceptable-use': {
    title: 'Acceptable use policy',
    updated: '2026-10-01',
    body: `
Forge is a place to practise and prove skills. To keep it fair and safe, you must not:

- **Attack Forge or anything else.** Security challenges use purpose-made files; only attack
  those. Don't probe the website, API, code runner or other users. See the
  [security challenge rules](/security/rules). Report vulnerabilities instead.
- **Abuse the code runner**: mining, scanning, denial of service, or trying to escape the sandbox.
- **Cheat in verified challenges, contests or duels**: someone else's help, AI help, sharing or
  copying solutions, or sharing flags.
- **Create several accounts** to get around limits or bans.
- **Post illegal, harassing or hateful content**, or other people's personal data.
- **Scrape Forge content in bulk** or resell access.

We may remove content, reset results or close accounts that break these rules. Decisions about
verified results are made by a person and can be appealed.
`,
  },
};
