import type { GenContext, Instance, Rng } from '@forge/problem-kit';

interface Event {
  t: number;
  ok: boolean;
  user: string;
  ip: string;
  invalid?: boolean;
}

const STAFF = ['alice', 'bmartin', 'chen', 'dpatel', 'eva', 'farah', 'gomez', 'hiro'];
const GUESSES = ['root', 'admin', 'test', 'oracle', 'ubuntu', 'guest', 'deploy'];

const pad = (n: number) => String(n).padStart(2, '0');
const clock = (t: number) =>
  `${pad(Math.floor(t / 3600))}:${pad(Math.floor(t / 60) % 60)}:${pad(t % 60)}`;

function randomTag(rng: Rng): string {
  return `FORGE{${rng.hex(12)}}`;
}

export default function generate({ rng, flag }: GenContext): Instance {
  const host = `bastion-${rng.int(1, 9)}`;
  const staff = rng.sample(STAFF, 6);
  const homeIp = new Map(staff.map((u, i) => [u, `10.20.${rng.int(1, 30)}.${10 + i * 7}`]));
  const events: Event[] = [];

  // Normal staff logins across the night: sometimes one typo first.
  for (const user of staff) {
    for (let n = rng.int(2, 5); n > 0; n--) {
      const t = rng.int(0, 7 * 3600);
      if (rng.bool(0.25)) events.push({ t, ok: false, user, ip: homeIp.get(user)! });
      events.push({ t: t + rng.int(4, 20), ok: true, user, ip: homeIp.get(user)! });
    }
  }

  // A noisy scanner that never gets in.
  const scanner = `198.51.100.${rng.int(2, 250)}`;
  let t = rng.int(0, 5 * 3600);
  for (let n = rng.int(15, 30); n > 0; n--) {
    const user = rng.pick(GUESSES);
    events.push({ t, ok: false, user, ip: scanner, invalid: user !== 'root' });
    t += rng.int(1, 6);
  }

  // The intruder: many guesses, then a success for a real staff account.
  const intruder = `203.0.113.${rng.int(2, 250)}`;
  const victim = rng.pick(staff);
  t = rng.int(3600, 6 * 3600);
  for (let n = rng.int(25, 45); n > 0; n--) {
    const user = rng.bool(0.6) ? victim : rng.pick(GUESSES);
    events.push({
      t,
      ok: false,
      user,
      ip: intruder,
      invalid: GUESSES.includes(user) && user !== 'root',
    });
    t += rng.int(1, 4);
  }
  const breach: Event = { t: t + 2, ok: true, user: victim, ip: intruder };
  events.push(breach);
  events.sort((a, b) => a.t - b.t);

  const lines = events.map((e) => {
    const pid = 1000 + ((e.t * 7) % 9000);
    const what = e.ok ? 'Accepted' : 'Failed';
    const who = e.invalid ? `invalid user ${e.user}` : e.user;
    return `Mar 14 ${clock(e.t)} ${host} sshd[${pid}]: ${what} password for ${who} from ${e.ip} port ${40000 + ((e.t * 13) % 20000)} ssh2`;
  });

  const rows = events
    .filter((e) => e.ok)
    .map((e, i) => {
      const tag =
        e === breach ? (flag ?? 'FORGE{flag-shown-only-to-signed-in-users}') : randomTag(rng);
      return `s-${String(4100 + i)},${e.user},${e.ip},2026-03-14T${clock(e.t)}Z,${tag}`;
    });

  return {
    params: { host, org: rng.pick(['Northwind Labs', 'Blue Owl Security', 'Kestrel Systems']) },
    files: {
      'auth.log': `${lines.join('\n')}\n`,
      'sessions.csv': `session_id,user,source_ip,opened_at,tag\n${rows.join('\n')}\n`,
    },
    data: { intruder, victim },
  };
}
