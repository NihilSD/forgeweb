## Idea

A password-guessing (brute-force) attack leaves a clear trail: a burst of `Failed password` lines from one address, often against both real and common usernames. The dangerous case is the one that ends in `Accepted`.

## Why it works

Grouping by source IP separates attackers from staff, who fail at most once before logging in. The scanner fails many times but never succeeds; the intruder's burst ends with a successful login to a real account. Joining that (user, IP) pair against `sessions.csv` identifies the exact session to investigate, which is what an incident responder would terminate first.

## Complexity

One pass over the log and one pass over the CSV: linear in the number of lines.

## Common mistakes

- Picking the IP with the most failures without checking whether it ever succeeded.
- Matching only on the username: the victim also has normal sessions from their own address.
- Defences worth remembering: rate limiting and lockouts, key-based SSH instead of passwords, multi-factor authentication, and alerts on "many failures then success".
