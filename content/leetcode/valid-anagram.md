---
slug: valid-anagram
status: attempted     # solved | attempted | review
date: 2026-11-15
time: O(n)
space: O(1)
lang: python
---
## Approach
count letters in the first string, subtract counts for the second, and check everything ends at zero.

## Code

```python
freq = {}

for ch in s:
    if ch not in freq:
        freq[ch] = 1
    else:
        freq[ch] += 1

for ch in t:
    if ch not in freq:
        return False
    else:
        freq[ch] -= 1

for value in freq.values():
    if value != 0:
        return False

return True
```

## Notes

