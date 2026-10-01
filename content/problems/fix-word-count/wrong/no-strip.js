// Lower-cases but leaves punctuation attached ("great!" and "great" differ).
function wordCounts(text) {
  const counts = {};
  for (const word of text.toLowerCase().split(/\s+/)) {
    if (word) counts[word] = (counts[word] ?? 0) + 1;
  }
  return counts;
}
