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
    return '/' + '/'.join(parts)
