# Events and non-profits

**Audience:** attendees, volunteers, donors, partners.
**Tone:** human, hopeful, transparent; stories over statistics, but honest numbers.
**Theme:** `editorial` (magazine look: strong hierarchy through size and weight); fallback
`bold` for festivals and launches.

## Typical episodes

| Episode                         | Blueprint       | Components                               |
| ------------------------------- | --------------- | ---------------------------------------- |
| Event agenda in 30 seconds      | `timeline`      | `timeline`, `chip`                       |
| How to register / volunteer     | `process-steps` | `steps`, `phone`                         |
| Where the donations go          | `stat-reveal`   | `donut-chart`, `counter` (person's data) |
| A year of impact                | `stat-reveal`   | `stat-card`, `bar-chart`                 |
| A (fictional) volunteer's story | `quote`         | `quote`, `title`                         |
| Venue access and transport      | `map-route`     | `node` + `arrow`, `icon`                 |

## Compliance

- Impact and fundraising numbers only from the person; never round up or extrapolate.
- No real beneficiaries' names or faces; fictional or anonymized stories, with consent noted by the
  person.
- No guilt-driven or graphic imagery; dignity first.
- Donation calls: no pressure tactics, no tax-deduction claims unless the person confirms them.
- Fictional organizations and sponsors only.

## Example

```yaml
script:
  - text: 'Where does every donation to Open Hands go?'
  - text: 'Most of it funds meals for families.'
  - text: 'Some pays for transport and storage.'
  - text: 'The rest keeps the volunteers trained and safe.'
  - text: 'Comment HELP to join our next food drive.'
```

Fictional names: Open Hands Foundation, Greenfield Arts Festival, Riverside Charity Run.
