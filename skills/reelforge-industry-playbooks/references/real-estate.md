# Real estate

**Audience:** first-time buyers, renters, small investors, sellers.
**Tone:** confident, practical, aspirational without hype.
**Theme:** `estate` (warm neutrals, gold or green accent); fallback `minimal`.

## Typical episodes

| Episode                            | Blueprint       | Components                              |
| ---------------------------------- | --------------- | --------------------------------------- |
| Buying a home in 5 steps           | `process-steps` | `steps`, `icon` (key, card)             |
| Renting vs buying (illustrative)   | `comparison`    | `comparison` (no winner unless factual) |
| Before and after a renovation      | `before-after`  | `before-after` (person's own images)    |
| What the closing costs are made of | `stat-reveal`   | `donut-chart` with illustrative shares  |
| A project timeline: permit to keys | `timeline`      | `timeline`, `chip`                      |
| Neighborhood tour                  | `map-route`     | `node` + `arrow`, `chip` (amenities)    |

## Compliance

- No promises of appreciation, rental yield or returns; no "guaranteed" or "best investment".
- Prices, rates and fees only from the person, labeled "example" otherwise.
- No financing or legal advice; point to a licensed agent, lender or notary.
- Fair housing: never describe who a home is "for" by family status, religion, origin or
  disability; describe the property and the area's amenities.
- Images only from the person's `assets/` (they must own them).

## Example

```yaml
script:
  - text: 'Buying your first home? It takes five steps.'
  - text: 'First, check what you can afford with a lender.'
  - text: 'Then visit homes and compare them on paper.'
  - text: 'Make an offer, then book an inspection.'
  - text: 'Finally, sign at closing and get your keys.'
  - text: 'Comment KEYS for our checklist episode.'
```

Fictional names: Cedar Homes, Oakridge Realty, Harbor View Residences.
