# Escapes quotes with a backslash, which SQLite does not understand: O'Brien still breaks.

import sqlite3


def find_orders(orders, customer):
    db = sqlite3.connect(':memory:')
    db.execute('CREATE TABLE orders (id INTEGER PRIMARY KEY, customer TEXT, total_cents INTEGER)')
    db.executemany('INSERT INTO orders VALUES (?, ?, ?)', orders)
    safe = customer.replace("'", "\\'")
    query = f"SELECT id FROM orders WHERE customer = '{safe}' ORDER BY id"
    return [row[0] for row in db.execute(query).fetchall()]
