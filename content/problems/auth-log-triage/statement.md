    The SSH server `{{host}}` at **{{org}}** raised an alert overnight. The security team exported two files:

    - `auth.log`: the server's SSH authentication log for the night (all times UTC).
    - `sessions.csv`: every session the server opened, each with a tracking `tag`.

    Someone guessed their way into a real staff account. Find the session the intruder opened and submit its tag. Tags look like `FORGE{...}`.

    Other IP addresses in the log are noisy too, so be sure you have the one that actually got in.

> This is a practice challenge built for Forge. Read the [challenge rules](/security/rules): only attack challenges on Forge itself.
