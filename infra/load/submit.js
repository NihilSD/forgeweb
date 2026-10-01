// Spec L12: 50 submissions per second for 5 minutes. Needs test accounts on staging (created by
// the setup step below) and RATE_LIMITS for the load-test accounts raised, or many accounts.
//   k6 run -e BASE_URL=https://staging.example -e PASSWORD=... infra/load/submit.js
import { check } from 'k6';
import http from 'k6/http';
import exec from 'k6/execution';

const BASE = __ENV.BASE_URL;
const ACCOUNTS = Number(__ENV.ACCOUNTS || 200);
const CODE = `def match_orders(amounts, target):
    seen = {}
    for j, a in enumerate(amounts):
        if target - a in seen:
            return [seen[target - a], j]
        seen[a] = j
    return []
`;

export const options = {
  scenarios: {
    submissions: {
      executor: 'constant-arrival-rate',
      rate: 50,
      timeUnit: '1s',
      duration: '5m',
      preAllocatedVUs: ACCOUNTS,
      maxVUs: ACCOUNTS,
    },
  },
  thresholds: {
    http_req_failed: ['rate<0.01'],
    'http_req_duration{kind:submit}': ['p(95)<500'],
  },
};

/** Signs in each load-test account once (loadtest-<n>@example.com, created beforehand). */
export function setup() {
  const sessions = [];
  for (let i = 0; i < ACCOUNTS; i++) {
    const jar = http.cookieJar();
    http.get(`${BASE}/api/v1/auth/csrf`);
    const csrf = jar.cookiesForURL(BASE).forge_csrf?.[0];
    const res = http.post(
      `${BASE}/api/v1/auth/login`,
      JSON.stringify({ email: `loadtest-${i}@example.com`, password: __ENV.PASSWORD }),
      { headers: { 'content-type': 'application/json', 'x-csrf-token': csrf } },
    );
    const cookies = jar.cookiesForURL(BASE);
    if (res.status === 200)
      sessions.push({ session: cookies.forge_session?.[0], csrf: cookies.forge_csrf?.[0] });
  }
  return { sessions };
}

export default function (data) {
  const s = data.sessions[exec.vu.idInTest % data.sessions.length];
  const res = http.post(
    `${BASE}/api/v1/problems/two-sum-orders/submit`,
    JSON.stringify({ language: 'python', code: CODE }),
    {
      tags: { kind: 'submit' },
      headers: {
        'content-type': 'application/json',
        'x-csrf-token': s.csrf,
        cookie: `forge_session=${s.session}; forge_csrf=${s.csrf}`,
      },
    },
  );
  check(res, { 'queued (202)': (r) => r.status === 202 });
}
