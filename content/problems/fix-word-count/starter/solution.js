function wordCounts(text) {
  const counts = {};
  for (const raw of text.split(/\s+/)) {
    const word = raw.replace(/^[.,!?;:"]+|[.,!?;:"]+$/g, '');
    if (word) counts[word] = (counts[word] ?? 0) + 1;
  }
  return counts;
}
