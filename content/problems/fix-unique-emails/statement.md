The **{{club}}** newsletter list collects sign-ups from several forms, so the same address can
appear more than once, in different capitals. `first_seen(emails)` removes the repeats.

- Two addresses are the same if they are equal **ignoring case**.
- Keep the **first** spelling of each address, in the order addresses first appear.

Return the cleaned list.

Members get the newsletter several times. The function has **one bug**.

## Example

```
emails = {{example_emails}}
result = {{example_result}}
```
