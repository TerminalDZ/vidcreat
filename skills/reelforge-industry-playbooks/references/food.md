# Food and hospitality

**Audience:** diners, home cooks, delivery customers, restaurant staff (training).
**Tone:** warm, sensory, quick; dialect works well in Arabic.
**Theme:** `bistro` (warm dark base, amber or tomato accent); fallback `bold`.

## Typical episodes

| Episode                            | Blueprint       | Components                    |
| ---------------------------------- | --------------- | ----------------------------- |
| How a dish is made in 4 steps      | `process-steps` | `steps`, `icon` (fire, clock) |
| Behind the kitchen: order to table | `process-steps` | `flow` with a moving token    |
| Faster service after a change      | `before-after`  | `before-after`, `counter`     |
| This week's menu                   | `timeline`      | `timeline`, `chip`            |
| Dine-in vs delivery                | `comparison`    | `comparison`                  |
| A guest's (fictional) review       | `quote`         | `quote`                       |

## Compliance

- No health or nutrition claims ("burns fat", "boosts immunity", "healthy" as a promise).
- Allergens: when listing ingredients, say "ask staff about allergens"; never claim
  "allergen-free" unless the person states it.
- No real chains, brands or delivery platforms; fictional restaurant names.
- Food-safety steps (temperatures, times) only as the person provides them.

## Example

```yaml
script:
  - text: 'How does your order reach the table in twelve minutes?'
  - text: 'The ticket hits the kitchen screen instantly.'
  - text: 'The grill and the cold station start together.'
  - text: 'The pass checks every plate before it leaves.'
  - text: "Comment MENU for this week's specials."
```

Fictional names: Maple Street Bistro, The Copper Pot, Saffron Table.
