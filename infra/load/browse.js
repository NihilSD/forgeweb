// Spec L12: 500 concurrent users browsing for 5 minutes. Run against staging with k6:
//   k6 run -e BASE_URL=https://staging.example infra/load/browse.js
import { check, sleep } from 'k6';
import http from 'k6/http';

const BASE = __ENV.BASE_URL;

export const options = {
  scenarios: {
    browse: {
      executor: 'ramping-vus',
      stages: [
        { duration: '1m', target: 500 },
        { duration: '5m', target: 500 },
        { duration: '30s', target: 0 },
      ],
    },
  },
  thresholds: {
    http_req_failed: ['rate<0.01'],
    'http_req_duration{kind:api}': ['p(95)<400'],
    'http_req_duration{kind:page}': ['p(95)<1500'],
  },
};

const PAGES = ['/', '/problems', '/learn', '/daily', '/pricing'];

export default function () {
  const page = PAGES[Math.floor(Math.random() * PAGES.length)];
  check(http.get(`${BASE}${page}`, { tags: { kind: 'page' } }), {
    'page 200': (r) => r.status === 200,
  });
  const list = http.get(`${BASE}/api/v1/problems?limit=20`, { tags: { kind: 'api' } });
  check(list, { 'list 200': (r) => r.status === 200 });
  const items = list.json('items') || [];
  if (items.length) {
    const slug = items[Math.floor(Math.random() * items.length)].slug;
    check(http.get(`${BASE}/api/v1/problems/${slug}`, { tags: { kind: 'api' } }), {
      'detail 200': (r) => r.status === 200,
    });
  }
  sleep(1 + Math.random() * 3);
}
