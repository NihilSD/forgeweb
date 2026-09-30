**{{app}}** stores user uploads under `/srv/uploads`. When someone downloads a file, the server calls `resolve_upload(name)` with the file name from the URL and reads the path it returns.

A tester requested `{{example_attack}}` and the function returned a path **outside** the upload folder: a path traversal bug.

Fix `resolve_upload(name)` so that it:

1. Returns `null` (`None` in Python) if `name` is empty, contains a NUL character, or starts with `/`.
2. Otherwise joins `name` onto `/srv/uploads` and normalises it: skip empty and `.` segments, and let `..` remove the previous segment. Names only ever use `/` as the separator.
3. Returns the normalised path **only if it is strictly inside** `/srv/uploads/` (the folder itself does not count). Otherwise returns `null`.

Keep the function name the same. Do not touch the file system: this is pure string handling.

## Examples

```
{{example_ok}} -> {{example_ok_result}}
{{example_attack}} -> null
```
