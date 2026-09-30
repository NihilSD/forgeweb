'use client';
import type { Me, SessionInfo } from '@forge/shared';
import {
  Alert,
  Badge,
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from '@forge/ui';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';
import { Field, FormError } from '@/components/form';
import { api, ApiClientError } from '@/lib/api-client';

function useAction() {
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const run = useCallback(async (fn: () => Promise<void>, success?: string) => {
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      await fn();
      if (success) setNotice(success);
    } catch (err) {
      setError(
        err instanceof ApiClientError
          ? (Object.values(err.fieldErrors())[0] ?? err.message)
          : 'Something went wrong.',
      );
    } finally {
      setBusy(false);
    }
  }, []);
  return { error, notice, busy, run };
}

function Notices({ error, notice }: { error: string | null; notice: string | null }) {
  return (
    <>
      <FormError message={error} />
      {notice ? <Alert variant="success">{notice}</Alert> : null}
    </>
  );
}

function ProfileSection({ me }: { me: Me }) {
  const router = useRouter();
  const [displayName, setDisplayName] = useState(me.displayName ?? '');
  const [timeZone, setTimeZone] = useState(me.timeZone);
  const [digest, setDigest] = useState(me.emailDigestOptIn);
  const a = useAction();
  return (
    <Card>
      <CardHeader>
        <CardTitle>Profile</CardTitle>
        <CardDescription>Signed in as {me.email}</CardDescription>
      </CardHeader>
      <CardContent>
        <form
          className="grid gap-4"
          onSubmit={(e) => {
            e.preventDefault();
            void a.run(async () => {
              await api('/me/profile', {
                method: 'PATCH',
                body: { displayName, timeZone, emailDigestOptIn: digest },
              });
              router.refresh();
            }, 'Profile saved.');
          }}
        >
          <Notices error={a.error} notice={a.notice} />
          <Field
            label="Display name"
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
          />
          <Field label="Time zone" value={timeZone} onChange={(e) => setTimeZone(e.target.value)} />
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              className="h-4 w-4"
              checked={digest}
              onChange={(e) => setDigest(e.target.checked)}
            />
            Send me a weekly progress email (you can unsubscribe from any email in one click)
          </label>
          <Button type="submit" className="w-fit" disabled={a.busy}>
            Save
          </Button>
        </form>
        {!me.emailVerified ? (
          <div className="mt-6 flex items-center gap-3">
            <Badge variant="warning">Email not verified</Badge>
            <Button
              variant="outline"
              size="sm"
              onClick={() =>
                void a.run(
                  () => api('/auth/verify-email/resend', { method: 'POST' }),
                  'Verification email sent.',
                )
              }
            >
              Resend verification email
            </Button>
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}

function PasswordSection({ me }: { me: Me }) {
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const a = useAction();
  return (
    <Card>
      <CardHeader>
        <CardTitle>{me.hasPassword ? 'Change password' : 'Set a password'}</CardTitle>
        <CardDescription>Changing your password signs out all other devices.</CardDescription>
      </CardHeader>
      <CardContent>
        <form
          className="grid gap-4"
          onSubmit={(e) => {
            e.preventDefault();
            void a.run(async () => {
              await api('/me/password', {
                method: 'POST',
                body: { currentPassword: me.hasPassword ? current : undefined, newPassword: next },
              });
              setCurrent('');
              setNext('');
            }, 'Password changed.');
          }}
        >
          <Notices error={a.error} notice={a.notice} />
          {me.hasPassword ? (
            <Field
              label="Current password"
              type="password"
              autoComplete="current-password"
              value={current}
              onChange={(e) => setCurrent(e.target.value)}
            />
          ) : null}
          <Field
            label="New password"
            type="password"
            autoComplete="new-password"
            value={next}
            onChange={(e) => setNext(e.target.value)}
          />
          <Button type="submit" className="w-fit" disabled={a.busy}>
            Update password
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}

function TwoFactorSection({ me }: { me: Me }) {
  const router = useRouter();
  const [setup, setSetup] = useState<{ secret: string; otpauthUrl: string } | null>(null);
  const [code, setCode] = useState('');
  const [recovery, setRecovery] = useState<string[] | null>(null);
  const a = useAction();
  return (
    <Card>
      <CardHeader>
        <CardTitle>Two-factor authentication</CardTitle>
        <CardDescription>
          {me.twoFactorEnabled
            ? 'On. You need a code from your authenticator app to sign in.'
            : 'Add a second step to sign in with an authenticator app.'}
        </CardDescription>
      </CardHeader>
      <CardContent className="grid gap-4">
        <Notices error={a.error} notice={a.notice} />
        {recovery ? (
          <div className="grid gap-2">
            <Alert>
              Save these recovery codes somewhere safe. Each works once. They won&apos;t be shown
              again.
            </Alert>
            <pre className="rounded-md bg-muted p-3 font-mono text-sm" data-testid="recovery-codes">
              {recovery.join('\n')}
            </pre>
          </div>
        ) : null}
        {!me.twoFactorEnabled && !setup ? (
          <Button
            className="w-fit"
            onClick={() =>
              void a.run(async () => setSetup(await api('/auth/2fa/setup', { method: 'POST' })))
            }
          >
            Set up two-factor
          </Button>
        ) : null}
        {!me.twoFactorEnabled && setup ? (
          <form
            className="grid gap-3"
            onSubmit={(e) => {
              e.preventDefault();
              void a.run(async () => {
                const res = await api<{ recoveryCodes: string[] }>('/auth/2fa/enable', {
                  method: 'POST',
                  body: { code },
                });
                setRecovery(res.recoveryCodes);
                setSetup(null);
                router.refresh();
              }, 'Two-factor authentication is on.');
            }}
          >
            <p className="text-sm">
              Add this key to your authenticator app (or{' '}
              <a className="text-primary underline" href={setup.otpauthUrl}>
                open it in the app
              </a>
              ), then enter the 6-digit code it shows.
            </p>
            <code
              className="w-fit rounded bg-muted px-2 py-1 font-mono text-sm"
              data-testid="totp-secret"
            >
              {setup.secret}
            </code>
            <Field
              label="Code"
              inputMode="numeric"
              autoComplete="one-time-code"
              value={code}
              onChange={(e) => setCode(e.target.value)}
            />
            <Button type="submit" className="w-fit" disabled={a.busy}>
              Turn on
            </Button>
          </form>
        ) : null}
        {me.twoFactorEnabled ? (
          <form
            className="grid gap-3"
            onSubmit={(e) => {
              e.preventDefault();
              void a.run(async () => {
                await api('/auth/2fa/disable', { method: 'POST', body: { code } });
                router.refresh();
              }, 'Two-factor authentication is off.');
            }}
          >
            <Field
              label="Code to turn off"
              inputMode="numeric"
              value={code}
              onChange={(e) => setCode(e.target.value)}
            />
            <Button type="submit" variant="outline" className="w-fit" disabled={a.busy}>
              Turn off
            </Button>
          </form>
        ) : null}
      </CardContent>
    </Card>
  );
}

function SessionsSection() {
  const [items, setItems] = useState<SessionInfo[] | null>(null);
  const a = useAction();
  const load = useCallback(async () => {
    const res = await api<{ items: SessionInfo[] }>('/me/sessions');
    setItems(res.items);
  }, []);
  useEffect(() => {
    void load();
  }, [load]);
  return (
    <Card>
      <CardHeader>
        <CardTitle>Devices</CardTitle>
        <CardDescription>Where you&apos;re signed in.</CardDescription>
      </CardHeader>
      <CardContent className="grid gap-3">
        <Notices error={a.error} notice={a.notice} />
        {items === null ? <p className="text-sm text-muted-foreground">Loading…</p> : null}
        <ul className="grid gap-2">
          {items?.map((s) => (
            <li
              key={s.id}
              className="flex items-center justify-between gap-4 rounded-md border p-3 text-sm"
            >
              <div className="min-w-0">
                <p className="truncate">{s.userAgent ?? 'Unknown device'}</p>
                <p className="text-xs text-muted-foreground">
                  Last active {new Date(s.lastSeenAt).toLocaleString()}
                </p>
              </div>
              {s.current ? (
                <Badge variant="secondary">This device</Badge>
              ) : (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() =>
                    void a.run(async () => {
                      await api(`/me/sessions/${s.id}`, { method: 'DELETE' });
                      await load();
                    }, 'Device signed out.')
                  }
                >
                  Sign out
                </Button>
              )}
            </li>
          ))}
        </ul>
        {items && items.length > 1 ? (
          <Button
            variant="outline"
            className="w-fit"
            onClick={() =>
              void a.run(async () => {
                await api('/me/sessions/revoke-others', { method: 'POST' });
                await load();
              }, 'Signed out of all other devices.')
            }
          >
            Sign out everywhere else
          </Button>
        ) : null}
      </CardContent>
    </Card>
  );
}

function DataSection({ me }: { me: Me }) {
  const router = useRouter();
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const a = useAction();
  return (
    <Card>
      <CardHeader>
        <CardTitle>Your data</CardTitle>
        <CardDescription>
          Download everything we store about you, or delete your account.
        </CardDescription>
      </CardHeader>
      <CardContent className="grid gap-6">
        <Notices error={a.error} notice={a.notice} />
        <Button asChild variant="outline" className="w-fit">
          <a href="/api/v1/me/export" download>
            Download my data (JSON)
          </a>
        </Button>
        {me.deletionScheduledFor ? (
          <div className="grid gap-3">
            <Alert variant="destructive">
              Your account will be deleted on{' '}
              {new Date(me.deletionScheduledFor).toLocaleDateString()}.
            </Alert>
            <Button
              className="w-fit"
              onClick={() =>
                void a.run(async () => {
                  await api('/me/delete/cancel', { method: 'POST' });
                  router.refresh();
                }, 'Your account will be kept.')
              }
            >
              Keep my account
            </Button>
          </div>
        ) : (
          <form
            className="grid gap-3"
            onSubmit={(e) => {
              e.preventDefault();
              void a.run(async () => {
                await api('/me/delete', {
                  method: 'POST',
                  body: { password: password || undefined, confirm },
                });
                router.push('/');
                router.refresh();
              });
            }}
          >
            <p className="text-sm text-muted-foreground">
              Deleting signs you out everywhere. Your data is permanently removed after 30 days;
              sign in before then to change your mind.
            </p>
            {me.hasPassword ? (
              <Field
                label="Password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            ) : null}
            <Field
              label='Type "DELETE" to confirm'
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
            />
            <Button
              type="submit"
              variant="destructive"
              className="w-fit"
              disabled={a.busy || confirm !== 'DELETE'}
            >
              Delete my account
            </Button>
          </form>
        )}
      </CardContent>
    </Card>
  );
}

export function SettingsClient({ me }: { me: Me }) {
  return (
    <Tabs defaultValue="profile" className="mt-6">
      <TabsList>
        <TabsTrigger value="profile">Profile</TabsTrigger>
        <TabsTrigger value="security">Security</TabsTrigger>
        <TabsTrigger value="data">Data</TabsTrigger>
      </TabsList>
      <TabsContent value="profile" className="grid gap-6">
        <ProfileSection me={me} />
      </TabsContent>
      <TabsContent value="security" className="grid gap-6">
        <PasswordSection me={me} />
        <TwoFactorSection me={me} />
        <SessionsSection />
      </TabsContent>
      <TabsContent value="data" className="grid gap-6">
        <DataSection me={me} />
      </TabsContent>
    </Tabs>
  );
}
