import type { GenContext, Instance, Rng } from '@forge/problem-kit';
import { ascii, base64 } from './bytes.ts';
import { ACK, pcap, PSH_ACK, type Segment, SYN, SYN_ACK } from './pcap.ts';

interface Exchange {
  path: string;
  auth?: string;
  status: string;
  body: string;
}

function exchange(
  rng: Rng,
  e: Exchange,
  client: string,
  server: string,
  port: number,
  time: number,
): Segment[] {
  const auth = e.auth ? `Authorization: Basic ${base64(ascii(e.auth))}\r\n` : '';
  const request = ascii(
    `GET ${e.path} HTTP/1.1\r\nHost: ${server}\r\nUser-Agent: curl/8.9.1\r\nAccept: */*\r\n${auth}\r\n`,
  );
  const challenge = e.status.startsWith('401') ? 'WWW-Authenticate: Basic realm="admin"\r\n' : '';
  const response = ascii(
    `HTTP/1.1 ${e.status}\r\nServer: nginx\r\nContent-Type: text/html\r\n${challenge}Content-Length: ${e.body.length}\r\n\r\n${e.body}`,
  );
  const c = rng.int(1, 2 ** 30);
  const s = rng.int(1, 2 ** 30);
  const seg = (
    dt: number,
    fromClient: boolean,
    seq: number,
    ack: number,
    flags: number,
    payload: number[] = [],
  ): Segment => ({
    time: time + dt,
    src: fromClient ? client : server,
    dst: fromClient ? server : client,
    sport: fromClient ? port : 80,
    dport: fromClient ? 80 : port,
    seq,
    ack,
    flags,
    payload,
  });
  return [
    seg(0, true, c, 0, SYN),
    seg(0.0004, false, s, c + 1, SYN_ACK),
    seg(0.0008, true, c + 1, s + 1, ACK),
    seg(0.001, true, c + 1, s + 1, PSH_ACK, request),
    seg(0.0042, false, s + 1, c + 1 + request.length, PSH_ACK, response),
    seg(0.0046, true, c + 1 + request.length, s + 1 + response.length, ACK),
  ];
}

export default function generate({ rng, flag }: GenContext): Instance {
  const server = `10.0.5.${rng.int(2, 20)}`;
  const client = `10.0.5.${rng.int(100, 200)}`;
  const user = rng.pick(['ops', 'admin', 'svc-deploy', 'netops']);
  const wrong = (): Exchange => ({
    path: '/admin/',
    auth: `${user}:FORGE{${rng.hex(12)}}`,
    status: '401 Unauthorized',
    body: '<h1>401 Unauthorized</h1>',
  });
  const exchanges: Exchange[] = [
    { path: '/', status: '200 OK', body: '<h1>Intranet</h1><a href="/admin/">Admin</a>' },
    { path: '/admin/', status: '401 Unauthorized', body: '<h1>401 Unauthorized</h1>' },
    ...rng.shuffle([wrong(), wrong(), wrong()]).slice(0, rng.int(2, 3)),
    {
      path: '/admin/',
      auth: `${user}:${flag ?? 'FORGE{flag-shown-only-to-signed-in-users}'}`,
      status: '200 OK',
      body: '<h1>Admin console</h1><p>Welcome back.</p>',
    },
    { path: '/static/admin.css', status: '200 OK', body: 'body{font-family:sans-serif}' },
  ];
  let time = 1773446400 + rng.int(0, 86_000);
  let port = rng.int(40000, 60000);
  const segments: Segment[] = [];
  for (const e of exchanges) {
    segments.push(...exchange(rng, e, client, server, port++, time));
    time += rng.int(2, 30) + rng.next();
  }
  return {
    params: { org: rng.pick(['Northwind Labs', 'Blue Owl Security', 'Kestrel Systems']), server },
    files: { 'capture.pcap': { base64: base64(pcap(segments)) } },
    data: { user },
  };
}
