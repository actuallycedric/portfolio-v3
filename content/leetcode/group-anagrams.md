---
slug: group-anagrams
status: attempted   # solved | attempted | review
date: 2026-11-15
time: O(n+m)
space: O(1)
lang: python
---
## Approach
for each string in the list of strings, create a list that tallies the frequency of each character. use ord(ch) - 97 to get a starting at index 0, b at index 1, etc. save each map as a defaultdict key by parsing it to a tuple. return a list of lists by returning list(dict.values())

## Code

```python
res = defaultdict(list)

for s in strs:
	
	freq = [0] * 26
	
	for ch in s:
		ch_idx = ord(ch) - 97		
		freq[ch_idx] += 1

	res[tuple(freq)].append(s)

return list(res.values())
```

## Notes

