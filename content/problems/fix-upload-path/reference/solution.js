const BASE = '/srv/uploads';

function resolveUpload(name) {
  if (!name || name.includes('\0') || name.startsWith('/')) return null;
  const parts = BASE.split('/').filter(Boolean);
  for (const part of name.split('/')) {
    if (part === '' || part === '.') continue;
    if (part === '..') parts.pop();
    else parts.push(part);
  }
  const path = '/' + parts.join('/');
  return path.startsWith(BASE + '/') ? path : null;
}
