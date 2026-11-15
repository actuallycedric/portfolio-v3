---
slug: valid-anagram
status: attempted     # solved | attempted | review
date: 2026-11-15
time: O(n)
space: O(1)
lang: python
---
## Approach
Count letters in the first string, subtract counts for the second, and check everything ends at zero.

## Code

```python
class Solution:
    def isAnagram(self, s: str, t: str) -> bool:
        if len(s) != len(t):
            return False
        counts = [0] * 26
        for a, b in zip(s, t):
            counts[ord(a) - ord("a")] += 1
            counts[ord(b) - ord("a")] -= 1
        return all(c == 0 for c in counts)
```

## Notes

