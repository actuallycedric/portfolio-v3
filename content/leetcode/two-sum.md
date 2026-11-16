---
slug: two-sum
status: solved        # solved | attempted | review
date: 2026-11-15
time: O(n)
space: O(n)
lang: python
---
## Approach
walk the list once, remembering each number's index in a dict. f
or each number, check whether its complement has already been seen.

## Code

```python
seen = {}  # value -> index

for i in range(len(nums)):
    if target - nums[i] in seen:
        return [seen[target - nums[i]], i]
    seen[nums[i]] = i
```

## Notes
- check before inserting, otherwise `n + n == target` matches itself.
- Sorting + two pointers also works but loses the original indices.
