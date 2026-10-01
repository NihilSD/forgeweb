function pageItems(items, page, size) {
  const start = (page - 1) * size;
  return items.slice(start, start + size);
}
