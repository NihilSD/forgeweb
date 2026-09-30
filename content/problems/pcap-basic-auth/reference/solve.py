import base64
import re
import struct


def tcp_payloads(data):
    """Yields (src_port, dst_port, payload) for every TCP packet in an Ethernet pcap."""
    offset = 24
    while offset + 16 <= len(data):
        _, _, length, _ = struct.unpack('<IIII', data[offset:offset + 16])
        frame = data[offset + 16:offset + 16 + length]
        offset += 16 + length
        if frame[12:14] != b'\x08\x00':
            continue
        ip = frame[14:]
        ihl = (ip[0] & 0x0F) * 4
        total = struct.unpack('>H', ip[2:4])[0]
        if ip[9] != 6:
            continue
        tcp = ip[ihl:total]
        sport, dport = struct.unpack('>HH', tcp[:4])
        header = (tcp[12] >> 4) * 4
        yield sport, dport, tcp[header:]


def solve(files):
    data = base64.b64decode(files['capture.pcap']['base64'])
    requests, responses = {}, {}
    for sport, dport, payload in tcp_payloads(data):
        if not payload:
            continue
        if dport == 80:
            requests[sport] = requests.get(sport, b'') + payload
        elif sport == 80:
            responses[dport] = responses.get(dport, b'') + payload
    for port, request in requests.items():
        if not responses.get(port, b'').startswith(b'HTTP/1.1 200'):
            continue
        match = re.search(rb'Authorization: Basic ([A-Za-z0-9+/=]+)', request)
        if match:
            return base64.b64decode(match.group(1)).decode().split(':', 1)[1]
    return None
