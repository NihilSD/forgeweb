function wordLengths(sentence) {
  const out = {};
  for (const w of sentence.split(' ').filter(Boolean)) out[w] = w.length;
  return out;
}
