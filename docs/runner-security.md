# Runner security: attacks and the restrictions that stop them

Spec 6.1 and 6.4. Every row is an automated test in `apps/runner/test/attacks.test.ts` that runs the
attack as a real submission in a real sandbox and checks the result, then checks the host (no
leftover containers, processes still start, disk usage unchanged, Docker responsive).

Last run: 29/29 contained (runc on a development machine). **Before launch, run the same suite on
the runner VM with `RUNNER_RUNTIME=runsc REQUIRE_DOCKER=1 pnpm --filter @forge/runner test`** — gVisor
adds a user-space kernel beneath every restriction below.

| Attack                             | What the test does                                | Blocked by                                                    | Result                                   |
| ---------------------------------- | ------------------------------------------------- | ------------------------------------------------------------- | ---------------------------------------- |
| Outbound TCP                       | `socket.create_connection(("1.1.1.1", 80))`       | `--network none`                                              | Network unreachable                      |
| DNS                                | `getaddrinfo("example.com")`                      | `--network none`                                              | Resolution fails                         |
| HTTP from JS                       | `fetch("http://1.1.1.1")`                         | `--network none`                                              | Request fails                            |
| Find other interfaces              | list network interfaces                           | `--network none`                                              | Only `lo`                                |
| Read privileged files              | `open("/etc/shadow")`                             | non-root user (uid 10001)                                     | PermissionError                          |
| Browse host / repo / Docker socket | check host paths, `/var/run/docker.sock`, `/proc` | separate root filesystem, PID namespace, only `/work` mounted | Not present; 1–2 processes visible       |
| Read secrets from env              | dump `os.environ`                                 | runner passes no env; harness keeps an allowlist              | No secret-like variables                 |
| Write root filesystem              | write to `/usr/local/lib`                         | `--read-only`                                                 | Read-only file system                    |
| Tamper with request/solution       | append to `/work/request.json`                    | `/work` mounted read-only                                     | Read-only file system                    |
| Fill the disk                      | write 1 MB chunks to `/tmp`                       | tmpfs `size=64m` (SQL: 256m)                                  | ENOSPC at ≤ 64 MB                        |
| Huge single file                   | one 32 MB write                                   | `--ulimit fsize=16MB`                                         | Write fails                              |
| Fork bomb                          | `os.fork()` in a loop                             | `--pids-limit 64`                                             | Stops below 64 processes                 |
| Memory bomb (Python)               | `bytearray(2 GB)`                                 | `--memory` = `--memory-swap`                                  | Memory Limit                             |
| Memory bomb (JS)                   | grow arrays forever                               | V8 heap cap just under `--memory`                             | Memory Limit                             |
| Infinite loop (Python)             | `while True: pass`                                | per-test `SIGALRM`                                            | Time Limit                               |
| Infinite loop, alarm disabled      | ignore `SIGALRM`, loop                            | progress watchdog + `docker kill`                             | Time Limit                               |
| Infinite loop (JS, synchronous)    | `while (true) {}`                                 | progress watchdog + `docker kill`                             | Time Limit in < 10 s                     |
| Output flood                       | write 64 KB chunks forever                        | stdout byte cap + kill                                        | Output Limit                             |
| Become root                        | `setuid(0)`; inspect `CapEff`, `NoNewPrivs`       | non-root, `--cap-drop ALL`, `no-new-privileges`               | uid 10001, no capabilities, NoNewPrivs=1 |
| sudo/su/pkexec                     | look for escalation binaries                      | minimal images                                                | None usable                              |
| mount / unshare (user, mount ns)   | raw syscalls via ctypes                           | no `CAP_SYS_ADMIN`, default seccomp profile                   | EPERM                                    |
| Load kernel module                 | `init_module` syscall                             | no `CAP_SYS_MODULE`, seccomp                                  | EPERM                                    |
| eBPF / keyctl                      | `bpf`, `keyctl` syscalls                          | default seccomp profile                                       | EPERM                                    |
| Write `/proc/sys`                  | write `kernel/hostname`                           | read-only `/proc/sys`                                         | Fails                                    |
| Raw memory device                  | open `/dev/mem`                                   | minimal `/dev`                                                | Not present                              |
| SQL: shell out                     | `COPY … TO PROGRAM`                               | query runs as unprivileged `solver` role                      | Permission denied                        |
| SQL: read server files             | `pg_read_file`, `lo_import`                       | `solver` role                                                 | Permission denied                        |
| SQL: read password hashes          | `SELECT * FROM pg_authid`                         | `solver` role                                                 | Permission denied                        |
| SQL: become superuser              | `SET ROLE postgres`                               | `solver` role                                                 | Permission denied                        |
| SQL: change data / create objects  | `DELETE`, `CREATE TABLE`                          | SELECT-only grants, read-only transactions                    | Error                                    |
| SQL: run forever                   | `pg_sleep(10)`                                    | `statement_timeout`                                           | Time Limit                               |

## Other properties

- **One container per run**, destroyed afterwards (`--rm`, plus `docker rm -f` in a `finally`);
  nothing is reused between users.
- **Signed jobs**: the runner executes only jobs HMAC-signed by the API and issued in the last
  10 minutes (`apps/runner/test/worker.test.ts`).
- **Signed results**: the API accepts a callback only with a valid HMAC over timestamp + raw body,
  at most 5 minutes old, for the submission's _current_ job id, once
  (`apps/api/test/submissions.test.ts`).
- **No credentials on runner hosts** except the job Redis user and the two HMAC key sets.
- Harnesses never see expected outputs; grading happens in the API.

## Known limits (accepted)

- Code can print fake harness result lines for its own tests. That is no stronger than returning
  those values, since the expected values are never in the sandbox.
- A verdict leaks one bit about hidden tests per submission (inherent to every judge). Submission
  rate limits bound it.
