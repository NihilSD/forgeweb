// Counts each kind of bracket instead of checking the order.
function isBalanced(code) {
  const count = (c) => [...code].filter((x) => x === c).length;
  return count('(') === count(')') && count('[') === count(']') && count('{') === count('}');
}
