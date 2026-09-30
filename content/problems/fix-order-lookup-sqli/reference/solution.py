import sqlite3


def find_orders(orders, customer):
    db = sqlite3.connect(':memory:')
    db.execute('CREATE TABLE orders (id INTEGER PRIMARY KEY, customer TEXT, total_cents INTEGER)')
    db.executemany('INSERT INTO orders VALUES (?, ?, ?)', orders)
    rows = db.execute(
        'SELECT id FROM orders WHERE customer = ? ORDER BY id', (customer,)
    ).fetchall()
    return [row[0] for row in rows]
