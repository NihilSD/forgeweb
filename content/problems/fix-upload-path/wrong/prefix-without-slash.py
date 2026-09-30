# Checks the prefix without the trailing slash: "/srv/uploads-archive/..." slips through.
BASE = '/srv/uploads'


def resolve_upload(name):
    if not name or '\0' in name or name.startswith('/'):
        return None
    parts = [p for p in BASE.split('/') if p]
    for part in name.split('/'):
        if part in ('', '.'):
            continue
        if part == '..':
            if parts:
                parts.pop()
        else:
            parts.append(part)
    path = '/' + '/'.join(parts)
    return path if path.startswith(BASE) else None
