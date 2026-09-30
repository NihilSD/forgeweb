import sqlite3


def find_orders(orders, customer):
    db = sqlite3.connect(':memory:')
    db.execute('CREATE TABLE orders (id INTEGER PRIMARY KEY, customer TEXT, total_cents INTEGER)')
    db.executemany('INSERT INTO orders VALUES (?, ?, ?)', orders)
    query = f"SELECT id FROM orders WHERE customer = '{customer}' ORDER BY id"
    rows = db.execute(query).fetchall()
    return [row[0] for row in rows]
