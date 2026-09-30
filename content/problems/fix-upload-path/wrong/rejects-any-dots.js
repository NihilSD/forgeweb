// Blocks every name containing "..", which also rejects safe names like "my..notes.txt".
const BASE = '/srv/uploads';

function resolveUpload(name) {
  if (!name || name.includes('\0') || name.startsWith('/') || name.includes('..')) return null;
  const parts = name.split('/').filter((p) => p !== '' && p !== '.');
  return parts.length ? BASE + '/' + parts.join('/') : null;
}
