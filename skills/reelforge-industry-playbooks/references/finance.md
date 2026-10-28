# Finance

**Audience:** everyday customers, small business owners, young earners.
**Tone:** trustworthy, neutral, jargon explained once; never salesy.
**Theme:** `ledger` (dark navy or ink, green accent for positive, red only for risk); fallback
`minimal`.

## Typical episodes

| Episode                                     | Blueprint          | Components                                  |
| ------------------------------------------- | ------------------ | ------------------------------------------- |
| How a budget works (50/30/20 as an example) | `stat-reveal`      | `donut-chart`, `counter`                    |
| What compound interest is                   | `stat-reveal`      | `line-chart` (illustrative values)          |
| Opening an account at a fictional bank      | `process-steps`    | `steps`, `phone`                            |
| Spotting a payment scam                     | `problem-solution` | `phone` notifications, `stamp`, `checklist` |
| Debit vs credit card                        | `comparison`       | `comparison` (no winner)                    |
| Fees explained                              | `stat-reveal`      | `table`, `bar-chart`                        |

## Compliance

- **No financial advice**: no "buy", "sell", "invest in", specific products, tickers, or
  allocations for the viewer. Explain concepts only.
- No promised returns, no "risk-free", no guarantees. Illustrative numbers are labeled
  ("example values").
- Add "General information, not financial advice." to the caption, and as a `label` on screen when
  numbers or growth curves appear.
- No real banks, cards, payment apps or exchanges; fictional ones only.
- Scam content: describe patterns, never show working phishing text or real phone numbers.

## Example

```yaml
script:
  - text: 'Why does a small saving grow so much over time?'
  - text: 'It is called compound interest.'
  - text: 'You earn interest on your interest, every year.'
  - text: 'Example values: one hundred becomes two hundred over time.'
  - text: 'General information, not financial advice. Follow for more.'
```

Fictional names: Brightway Bank, Ledgerline Credit Union, Northstar Pay.
