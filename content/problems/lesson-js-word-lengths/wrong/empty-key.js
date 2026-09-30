function wordLengths(sentence) {
  const out = {};
  for (const w of sentence.split(' ')) out[w] = w.length;
  return out;
}
