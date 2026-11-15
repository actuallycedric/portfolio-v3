---
slug: contains-duplicate
status: review        # solved | attempted | review
date: 2026-11-14
time: O(n)
space: O(n)
lang: python
---
## Approach
Add each number to a set; if it's already there, there's a duplicate.

## Code

```python
class Solution:
    def containsDuplicate(self, nums: list[int]) -> bool:
        seen = set()
        for n in nums:
            if n in seen:
                return True
            seen.add(n)
        return False
```

## Notes
Redo without looking: the one-liner `len(set(nums)) < len(nums)` is shorter but can't exit early.
