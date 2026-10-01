function firstSeen(emails) {
  const seen = new Set();
  const result = [];
  for (const email of emails) {
    const key = email.toLowerCase();
    if (!seen.has(key)) {
      seen.add(key);
      result.push(email);
    }
  }
  return result;
}
