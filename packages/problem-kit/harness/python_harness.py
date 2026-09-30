"""Forge Python harness.

Runs the user's function against each test and streams one result line per test to the real
stdout, prefixed with a marker (user prints are captured separately). It never sees expected
outputs: comparison happens outside, in the grader.

Usage: python3 python_harness.py <request.json> <solution.py>
"""

import copy
import io
import json
import signal
import sys
import time
import traceback


MARKER = '\x1eFORGE\x1f'


class _TestTimeout(BaseException):
    """Raised by the per-test alarm. BaseException so `except Exception` in user code can't swallow it."""


def _on_alarm(signum, frame):
    raise _TestTimeout()


def _jsonable(value):
    if isinstance(value, (set, frozenset)):
        return sorted((_jsonable(v) for v in value), key=lambda v: json.dumps(v, sort_keys=True))
    if isinstance(value, tuple):
        return [_jsonable(v) for v in value]
    if isinstance(value, list):
        return [_jsonable(v) for v in value]
    if isinstance(value, dict):
        return {str(k): _jsonable(v) for k, v in value.items()}
    if isinstance(value, float) and value != value:
        return None
    return value


def _short_error(exc):
    lines = traceback.format_exception(type(exc), exc, exc.__traceback__)
    # Keep only frames from the user's file plus the final message.
    kept = [l for l in lines if 'solution.py' in l or not l.startswith('  File')]
    text = ''.join(kept[-6:])
    return text[-2000:]


def main():
    request_path, solution_path = sys.argv[1:3]
    with open(request_path, encoding='utf-8') as f:
        request = json.load(f)
    with open(solution_path, encoding='utf-8') as f:
        source = f.read()

    out = sys.__stdout__

    def write_line(line):
        out.write(MARKER + line + '\n')
        out.flush()

    def emit(obj):
        write_line(json.dumps(obj))

    try:
        code = compile(source, 'solution.py', 'exec')
    except SyntaxError as exc:
        emit({'type': 'compile_error', 'error': f'{exc.msg} (line {exc.lineno})'})
        return

    real_stdout = sys.stdout
    namespace = {'__name__': 'solution'}
    capture = io.StringIO()
    sys.stdout = capture
    try:
        exec(code, namespace)
    except BaseException as exc:  # noqa: BLE001 - report any import-time failure
        sys.stdout = real_stdout
        emit({'type': 'load_error', 'error': _short_error(exc)})
        return
    finally:
        sys.stdout = real_stdout

    entry = request['entry']
    fn = namespace.get(entry)
    if not callable(fn):
        emit({'type': 'load_error', 'error': f'Define a function named {entry}.'})
        return

    limit_s = request['limits']['timeMs'] / 1000.0
    output_limit = request['limits']['outputKb'] * 1024
    sys.setrecursionlimit(20000)
    signal.signal(signal.SIGALRM, _on_alarm)
    emit({'type': 'start'})

    for test in request['tests']:
        capture = io.StringIO()
        sys.stdout = capture
        started = time.perf_counter()
        result = {'type': 'test', 'id': test['id']}
        try:
            signal.setitimer(signal.ITIMER_REAL, limit_s)
            value = fn(*copy.deepcopy(test.get('args', [])))
            signal.setitimer(signal.ITIMER_REAL, 0)
            result['status'] = 'ok'
            result['value'] = _jsonable(value)
        except _TestTimeout:
            result['status'] = 'time_limit'
        except MemoryError:
            signal.setitimer(signal.ITIMER_REAL, 0)
            result['status'] = 'memory_limit'
        except RecursionError:
            signal.setitimer(signal.ITIMER_REAL, 0)
            result['status'] = 'error'
            result['error'] = 'RecursionError: maximum recursion depth exceeded'
        except BaseException as exc:  # noqa: BLE001 - user code may raise anything
            signal.setitimer(signal.ITIMER_REAL, 0)
            result['status'] = 'error'
            result['error'] = _short_error(exc)
        finally:
            sys.stdout = real_stdout
        result['timeMs'] = round((time.perf_counter() - started) * 1000, 3)
        printed = capture.getvalue()
        if len(printed) > output_limit:
            result['status'] = 'output_limit'
            printed = printed[:1000]
        result['stdout'] = printed[:4000]
        try:
            line = json.dumps(result)
        except (TypeError, ValueError):
            result.pop('value', None)
            result['status'] = 'error'
            result['error'] = 'Your function returned a value that cannot be converted to JSON.'
            line = json.dumps(result)
        if len(line) > output_limit + 8192:
            result = {'type': 'test', 'id': test['id'], 'status': 'output_limit', 'timeMs': result['timeMs']}
            line = json.dumps(result)
        write_line(line)
    emit({'type': 'done'})


if __name__ == '__main__':
    main()
