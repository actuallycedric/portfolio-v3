---
slug: two-sum
status: solved        # solved | attempted | review
date: 2026-11-15
time: O(n)
space: O(n)
lang: python
---
## Approach
Walk the list once, remembering each number's index in a dict. For each number, check whether its complement (`target - n`) has already been seen.

## Code

```python
class Solution:
    def twoSum(self, nums: list[int], target: int) -> list[int]:
        seen = {}  # value -> index
        for i, n in enumerate(nums):
            if target - n in seen:
                return [seen[target - n], i]
            seen[n] = i
```

## Notes
- Check before inserting, otherwise `n + n == target` matches itself.
- Sorting + two pointers also works but loses the original indices.
