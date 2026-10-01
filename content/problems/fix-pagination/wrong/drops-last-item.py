# Fixes the start but cuts each page one item short.
def page_items(items, page, size):
    start = (page - 1) * size
    return items[start:start + size - 1]
