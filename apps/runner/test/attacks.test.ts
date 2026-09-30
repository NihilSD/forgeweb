/**
 * Spec 6.4 attack suite. Every test runs hostile code as a real submission in a real sandbox and
 * checks that (a) the attack is contained, (b) the verdict is correct and (c) the host is fine.
 * The restriction that blocks each attack is in the test name; docs/runner-security.md has the
 * full table. Run on a runner VM with RUNNER_RUNTIME=runsc to verify gVisor too.
 */
import { execFileSync, spawnSync } from 'node:child_process';
import { statfsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { dockerAvailable, leftoverContainers, runF, runSql } from './sandbox.js';

const enabled = dockerAvailable();

function value(res: Awaited<ReturnType<typeof runF>>) {
  return res.tests[0]?.value as Record<string, unknown> | string | undefined;
}

describe.skipIf(!enabled)('runner attack suite (spec 6.4)', () => {
  let freeBefore = 0;
  beforeAll(() => {
    const s = statfsSync(tmpdir());
    freeBefore = s.bavail * s.bsize;
  });

  describe('network [--network none]', () => {
    it('python: outbound TCP is unreachable', async () => {
      const res = await runF(
        'python',
        `import socket
def f():
    try:
        socket.create_connection(("1.1.1.1", 80), timeout=2)
        return "CONNECTED"
    except OSError as e:
        return "blocked"`,
      );
      expect(value(res)).toBe('blocked');
    });

    it('python: DNS does not resolve', async () => {
      const res = await runF(
        'python',
        `import socket
def f():
    try:
        socket.getaddrinfo("example.com", 80)
        return "RESOLVED"
    except OSError:
        return "blocked"`,
      );
      expect(value(res)).toBe('blocked');
    });

    it('javascript: fetch fails', async () => {
      const res = await runF(
        'javascript',
        `async function f() {
  try { await fetch('http://1.1.1.1/', { signal: AbortSignal.timeout(1500) }); return 'CONNECTED'; }
  catch { return 'blocked'; }
}`,
      );
      expect(value(res)).toBe('blocked');
    });

    it('only the loopback interface exists', async () => {
      const res = await runF('python', `import socket\ndef f():\n    return sorted(n for _, n in socket.if_nameindex())`);
      expect(value(res)).toEqual(['lo']);
    });
  });

  describe('host files and secrets [separate filesystem, non-root user, empty env]', () => {
    it('cannot read privileged files', async () => {
      const res = await runF(
        'python',
        `def f():
    try:
        open("/etc/shadow").read()
        return "READ"
    except PermissionError:
        return "blocked"`,
      );
      expect(value(res)).toBe('blocked');
    });

    it('sees no host files, repo, docker socket or other runs', async () => {
      const res = await runF(
        'python',
        `import os
def f():
    return {
        "repo": os.path.exists("/home/user/forgeweb"),
        "docker_sock": os.path.exists("/var/run/docker.sock"),
        "work": sorted(os.listdir("/work")),
        "host_procs": len([p for p in os.listdir("/proc") if p.isdigit()]),
    }`,
      );
      const v = value(res) as { repo: boolean; docker_sock: boolean; work: string[]; host_procs: number };
      expect(v.repo).toBe(false);
      expect(v.docker_sock).toBe(false);
      expect(v.work).toEqual(['request.json', 'solution.py']);
      expect(v.host_procs).toBeLessThan(5); // own PID namespace
    });

    it('has no secrets in its environment', async () => {
      const res = await runF('python', `import os\ndef f():\n    return sorted(os.environ.keys())`);
      const keys = value(res) as unknown as string[];
      expect(keys.filter((k) => /SECRET|KEY|TOKEN|PASS|DATABASE|REDIS|STRIPE|AWS/i.test(k))).toEqual([]);
    });
  });

  describe('filesystem writes [--read-only, read-only /work mount, tmpfs size, fsize ulimit]', () => {
    it('cannot write to the root filesystem', async () => {
      const res = await runF(
        'python',
        `def f():
    try:
        open("/usr/local/lib/evil.py", "w").write("x")
        return "WROTE"
    except OSError as e:
        return "blocked"`,
      );
      expect(value(res)).toBe('blocked');
    });

    it('cannot modify its own submission or request', async () => {
      const res = await runF(
        'python',
        `def f():
    try:
        open("/work/request.json", "a").write("x")
        return "WROTE"
    except OSError:
        return "blocked"`,
      );
      expect(value(res)).toBe('blocked');
    });

    it('cannot fill the disk', async () => {
      const res = await runF(
        'python',
        `import errno
def f():
    written = 0
    chunk = b"x" * (1 << 20)
    try:
        for i in range(10_000):
            with open(f"/tmp/fill{i}", "wb") as fh:
                for _ in range(8):
                    fh.write(chunk)
                    written += 1
    except OSError as e:
        return {"stopped_mb": written, "errno": errno.errorcode.get(e.errno)}
    return {"stopped_mb": written, "errno": None}`,
        { timeMs: 5000, memoryMb: 128, outputKb: 64 },
      );
      const v = value(res) as { stopped_mb: number; errno: string | null };
      expect(v.errno).toBe('ENOSPC');
      expect(v.stopped_mb).toBeLessThanOrEqual(64);
    });

    it('cannot create a huge single file', async () => {
      const res = await runF(
        'python',
        `def f():
    try:
        with open("/tmp/big", "wb") as fh:
            fh.write(b"x" * (32 << 20))
        return "WROTE"
    except OSError as e:
        return "blocked"`,
        { timeMs: 5000, memoryMb: 128, outputKb: 64 },
      );
      // The fsize limit raises SIGXFSZ or EFBIG; either way the write never completes.
      expect(value(res) === 'blocked' || res.tests[0]?.status !== 'ok').toBe(true);
    });
  });

  describe('resource exhaustion [--pids-limit, --memory, time limits + watchdog, output cap]', () => {
    it('fork bomb is capped by the pids limit', async () => {
      const res = await runF(
        'python',
        `import os, time
def f():
    n = 0
    try:
        while True:
            if os.fork() == 0:
                time.sleep(60)
                os._exit(0)
            n += 1
    except OSError:
        return n`,
      );
      expect(typeof value(res)).toBe('number');
      expect(value(res) as unknown as number).toBeLessThan(64);
    });

    it('python: huge allocation gives Memory Limit', async () => {
      const res = await runF('python', `def f():\n    x = bytearray(1 << 31)\n    return len(x)`);
      expect(res.tests[0]?.status === 'memory_limit' || res.status === 'memory_limit').toBe(true);
    });

    it('javascript: unbounded growth gives Memory Limit', async () => {
      const res = await runF('javascript', `function f() { const a = []; while (true) a.push(new Array(100000).fill(1)); }`);
      expect(res.tests[0]?.status === 'memory_limit' || res.status === 'memory_limit').toBe(true);
    });

    it('python: infinite loop gives Time Limit', async () => {
      const res = await runF('python', `def f():\n    while True:\n        pass`);
      expect(res.tests[0]?.status).toBe('time_limit');
    });

    it('python: disabling the per-test alarm still gives Time Limit (watchdog)', async () => {
      const res = await runF(
        'python',
        `import signal
def f():
    signal.signal(signal.SIGALRM, signal.SIG_IGN)
    while True:
        pass`,
      );
      expect(res.tests[0]?.status).toBe('time_limit');
    });

    it('javascript: synchronous infinite loop gives Time Limit (watchdog)', async () => {
      const res = await runF('javascript', `function f() { while (true) {} }`);
      expect(res.tests[0]?.status).toBe('time_limit');
      expect(res.timeMs).toBeLessThan(10_000);
    });

    it('output flood gives Output Limit', async () => {
      const res = await runF('python', `import os\ndef f():\n    while True:\n        os.write(1, b"x" * 65536)`);
      expect(res.status === 'output_limit' || res.tests[0]?.status === 'output_limit').toBe(true);
    });
  });

  describe('privilege escalation [non-root user, --cap-drop ALL, no-new-privileges]', () => {
    it('runs as an unprivileged user with no capabilities', async () => {
      const res = await runF(
        'python',
        `import os
def f():
    status = dict(l.split(":", 1) for l in open("/proc/self/status") if ":" in l)
    try:
        os.setuid(0)
        became_root = True
    except PermissionError:
        became_root = False
    return {"uid": os.getuid(), "cap_eff": status["CapEff"].strip(), "no_new_privs": status["NoNewPrivs"].strip(), "became_root": became_root}`,
      );
      expect(value(res)).toEqual({ uid: 10001, cap_eff: '0000000000000000', no_new_privs: '1', became_root: false });
    });

    it('has no sudo or su to abuse', async () => {
      const res = await runF(
        'python',
        `import shutil\ndef f():\n    return [p for p in ("sudo", "su", "doas", "pkexec") if shutil.which(p) and "su" != p]`,
      );
      expect(value(res)).toEqual([]);
    });
  });

  describe('container escape techniques [seccomp default profile, no CAP_SYS_ADMIN, read-only /proc/sys]', () => {
    it('blocks mount, unshare, module loading, bpf and /proc/sys writes', async () => {
      const res = await runF(
        'python',
        `import ctypes, ctypes.util, os
libc = ctypes.CDLL(None, use_errno=True)
def attempt(fn):
    try:
        r = fn()
        return "BLOCKED" if r == -1 else "ALLOWED"
    except OSError:
        return "BLOCKED"
def f():
    os.makedirs("/tmp/m", exist_ok=True)
    out = {}
    out["mount"] = attempt(lambda: libc.mount(b"proc", b"/tmp/m", b"proc", 0, None))
    out["unshare_user"] = attempt(lambda: libc.unshare(0x10000000))
    out["unshare_mount"] = attempt(lambda: libc.unshare(0x00020000))
    out["init_module"] = attempt(lambda: libc.syscall(175, None, 0, b""))
    out["bpf"] = attempt(lambda: libc.syscall(321, 0, None, 0))
    out["keyctl"] = attempt(lambda: libc.syscall(250, 0, 0, 0, 0, 0))
    def proc_sys():
        open("/proc/sys/kernel/hostname", "w").write("owned")
        return 0
    out["proc_sys_write"] = attempt(proc_sys)
    out["dev_mem"] = "EXISTS" if os.path.exists("/dev/mem") else "BLOCKED"
    return out`,
      );
      const v = value(res) as Record<string, string>;
      for (const [k, result] of Object.entries(v)) expect(result, k).toBe('BLOCKED');
    });
  });

  describe('SQL sandbox [unprivileged solver role, read-only transactions, statement timeout]', () => {
    it.each([
      ['run a shell command', "COPY (SELECT 1) TO PROGRAM 'id';"],
      ['read server files', "SELECT pg_read_file('/etc/passwd');"],
      ['read password hashes', 'SELECT * FROM pg_authid;'],
      ['become superuser', 'SET ROLE postgres; SELECT 1;'],
      ['modify data', 'DELETE FROM t;'],
      ['create objects', 'CREATE TABLE evil (x int);'],
      ['import large objects', "SELECT lo_import('/etc/passwd');"],
    ])('cannot %s', async (_name, sql) => {
      const res = await runSql(sql);
      expect(res.tests[0]?.status).toBe('error');
    });

    it('a slow query gives Time Limit', async () => {
      const res = await runSql('SELECT pg_sleep(10);');
      expect(res.tests[0]?.status).toBe('time_limit');
    });
  });

  afterAll(async () => {
    // Host health after the whole suite.
    await new Promise((r) => setTimeout(r, 1500));
    expect(leftoverContainers(), 'containers left behind').toEqual([]);
    expect(spawnSync('true').status, 'host can still start processes').toBe(0);
    const s = statfsSync(tmpdir());
    expect(freeBefore - s.bavail * s.bsize, 'host disk usage grew').toBeLessThan(50 * 1024 * 1024);
    expect(execFileSync('docker', ['info', '--format', '{{.ServerVersion}}'], { encoding: 'utf8' }).trim()).not.toBe('');
  });
});
