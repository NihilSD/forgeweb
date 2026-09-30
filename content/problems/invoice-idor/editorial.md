## Idea

The single-invoice route authenticates the user (`requireLogin`) but does not **authorize** the request: it loads any invoice by id. Sequential ids make it easy to guess other customers' invoices. This is an IDOR, part of _Broken Access Control_, the top category in the OWASP Top 10.

## Why it works

The log records who asked for which id and whether it succeeded. Joining it with the invoice owners shows the one successful request where the requester is not the owner. The 404 before it is the same user probing for ids.

## Complexity

One pass over the log with a dictionary lookup per line.

## Common mistakes

The fix: scope the lookup to the caller, so another customer's invoice is indistinguishable from a missing one:

```js
const invoice = await db.invoices.findFirst({
  where: { id: Number(req.params.id), owner: req.user.id },
});
if (!invoice) return res.status(404).json({ error: 'not_found' });
```

Common mistakes: returning `403` for other people's invoices (it confirms the id exists), relying on unguessable ids instead of an ownership check, and hiding the link in the UI while the API stays open.
