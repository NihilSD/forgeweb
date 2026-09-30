function wordLengths(sentence: string): Record<string, number> {
  const out: Record<string, number> = {};
  for (const w of sentence.split(' ').filter(Boolean)) out[w] = w.length;
  return out;
}
