    Customers of **{{org}}**'s billing portal can view their invoices. A customer wrote in to say they could see an invoice that was not theirs.

    You have three files:

    - `invoices.js`: the portal's invoice routes.
    - `access.log`: one JSON object per request for the last day.
    - `invoices.json`: an export of the invoices involved.

    Read the code and find the access-control bug. Then use the log to find the invoice that was actually shown to someone who does not own it, and submit that invoice's `reference` (`FORGE{...}`).

> This is a practice challenge built for Forge. Read the [challenge rules](/security/rules): only attack challenges on Forge itself.
