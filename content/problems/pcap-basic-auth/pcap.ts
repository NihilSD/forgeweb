/** Minimal pcap writer: Ethernet + IPv4 + TCP, with correct checksums. */

const u16 = (n: number) => [(n >> 8) & 0xff, n & 0xff];
const u32 = (n: number) => [(n >>> 24) & 0xff, (n >>> 16) & 0xff, (n >>> 8) & 0xff, n & 0xff];
const u32le = (n: number) => u32(n).reverse();
const u16le = (n: number) => u16(n).reverse();
const ip4 = (ip: string) => ip.split('.').map(Number);

function checksum(bytes: number[]): number {
  let sum = 0;
  for (let i = 0; i < bytes.length; i += 2) sum += (bytes[i]! << 8) | (bytes[i + 1] ?? 0);
  while (sum > 0xffff) sum = (sum & 0xffff) + (sum >>> 16);
  return ~sum & 0xffff;
}

export interface Segment {
  time: number;
  src: string;
  dst: string;
  sport: number;
  dport: number;
  seq: number;
  ack: number;
  flags: number;
  payload: number[];
}

export const SYN = 0x02;
export const ACK = 0x10;
export const PSH_ACK = 0x18;
export const SYN_ACK = 0x12;

function packet(s: Segment): number[] {
  const tcpNoSum = [
    ...u16(s.sport),
    ...u16(s.dport),
    ...u32(s.seq),
    ...u32(s.ack),
    0x50,
    s.flags,
    ...u16(64240),
    0,
    0,
    0,
    0,
    ...s.payload,
  ];
  const pseudo = [...ip4(s.src), ...ip4(s.dst), 0, 6, ...u16(tcpNoSum.length)];
  const tcpSum = checksum([...pseudo, ...tcpNoSum]);
  const tcp = [...tcpNoSum.slice(0, 16), ...u16(tcpSum), ...tcpNoSum.slice(18)];
  const ipNoSum = [
    0x45,
    0,
    ...u16(20 + tcp.length),
    0,
    0,
    0x40,
    0,
    64,
    6,
    0,
    0,
    ...ip4(s.src),
    ...ip4(s.dst),
  ];
  const ipSum = checksum(ipNoSum);
  const ip = [...ipNoSum.slice(0, 10), ...u16(ipSum), ...ipNoSum.slice(12)];
  const eth = [0x02, 0, 0, 0, 0, 0x02, 0x02, 0, 0, 0, 0, 0x01, 0x08, 0x00];
  return [...eth, ...ip, ...tcp];
}

export function pcap(segments: Segment[]): number[] {
  // Global header: magic, v2.4, tz 0, sigfigs 0, snaplen 65535, linktype 1 (Ethernet).
  const out = [
    ...u32le(0xa1b2c3d4),
    ...u16le(2),
    ...u16le(4),
    ...u32le(0),
    ...u32le(0),
    ...u32le(65535),
    ...u32le(1),
  ];
  for (const s of segments) {
    const p = packet(s);
    const sec = Math.floor(s.time);
    const usec = Math.round((s.time - sec) * 1e6);
    out.push(...u32le(sec), ...u32le(usec), ...u32le(p.length), ...u32le(p.length), ...p);
  }
  return out;
}
