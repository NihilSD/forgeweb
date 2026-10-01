PAIRS = {')': '(', ']': '[', '}': '{'}


def is_balanced(code):
    stack = []
    for ch in code:
        if ch in '([{':
            stack.append(ch)
        elif ch in PAIRS:
            if not stack or stack.pop() != PAIRS[ch]:
                return False
    return not stack
