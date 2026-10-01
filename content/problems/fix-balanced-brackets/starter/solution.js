const PAIRS = { ')': '(', ']': '[', '}': '{' };

function isBalanced(code) {
  const stack = [];
  for (const ch of code) {
    if ('([{'.includes(ch)) {
      stack.push(ch);
    } else if (ch in PAIRS) {
      if (stack.length === 0 || stack.pop() !== PAIRS[ch]) return false;
    }
  }
  return true;
}
