# Retail

**Audience:** shoppers, store staff (training), small shop owners.
**Tone:** upbeat, concrete, benefit-first; short sentences.
**Theme:** `retail` (bright accent, clean base); fallback `bold`.

## Typical episodes

| Episode                                | Blueprint       | Components                      |
| -------------------------------------- | --------------- | ------------------------------- |
| How click-and-collect works            | `process-steps` | `steps`, `phone`, `icon` (cart) |
| Returns in 3 steps                     | `process-steps` | `checklist`                     |
| This season's best sellers (fictional) | `stat-reveal`   | `ranking`, `bar-chart`          |
| Product A vs product B (own products)  | `comparison`    | `comparison`                    |
| Store opening timeline                 | `timeline`      | `timeline`                      |
| Loyalty program explained              | `stat-reveal`   | `progress-ring`, `stat-card`    |

## Compliance

- No real brands, competitors or comparative claims against named companies.
- Prices, discounts and dates exactly as the person gives them; state conditions ("while stock
  lasts", "until 30 June") when they apply.
- No fake urgency ("only 2 left") unless true and provided by the person.
- Fictional products and stores; product images only from the person's `assets/`.

## Example

```yaml
script:
  - text: 'Ordered online? Pick it up in two hours.'
  - text: 'Choose click and collect at checkout.'
  - text: 'We text you when your bag is ready.'
  - text: 'Show the code at the counter, and you are done.'
  - text: 'Follow for our returns guide.'
```

Fictional names: Corner & Co., Bluebell Market, Northside Outfitters.
