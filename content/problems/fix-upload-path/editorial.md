## Idea

Path traversal happens when user input is joined onto a folder path and `..` segments walk out of it. The robust defence is to **normalise first, then check containment** of the final path, rather than trying to spot bad input.

## Why it works

After normalisation there are no `.` or `..` segments left, so a plain prefix test is meaningful. The prefix must include the trailing `/`, otherwise a sibling folder such as `/srv/uploads-archive` would pass, and the folder itself (`/srv/uploads`) would be returned as if it were a file.

## Complexity

Linear in the length of the name.

## Common mistakes

- Blocking any name containing `..`: it rejects safe names and still misses other tricks in real systems (encoded dots, backslashes on Windows, symlinks).
- Checking the prefix before normalising.
- In production, also resolve symlinks (`realpath`) before the containment check, store uploads under generated ids instead of user-chosen names, and never serve them with the permissions of a privileged process.
