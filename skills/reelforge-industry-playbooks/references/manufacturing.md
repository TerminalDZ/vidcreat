# Manufacturing

**Audience:** operators and technicians (training), B2B buyers, recruits.
**Tone:** precise, safety-first, factual; English technical terms kept in Arabic.
**Theme:** `industrial` (graphite base, safety amber accent); fallback `default`.

## Typical episodes

| Episode                                 | Blueprint          | Components                             |
| --------------------------------------- | ------------------ | -------------------------------------- |
| How a part is made, raw material to box | `process-steps`    | `flow` with a moving token             |
| Quality check steps                     | `process-steps`    | `checklist`, `node` with `status`      |
| Downtime and its causes                 | `stat-reveal`      | `ranking`, `donut-chart`, `meter`      |
| Line before and after an improvement    | `before-after`     | `before-after`, `stat-card` with delta |
| Shift handover timeline                 | `timeline`         | `timeline`, `lanes`                    |
| Safety: the common mistake              | `problem-solution` | `trap`, `stamp`, `checklist`           |

## Compliance

- Safety content must follow the person's official procedures; never improvise steps, limits or
  protective equipment rules.
- No real companies, machines' brand names or customer names.
- Metrics (OEE, scrap rate, downtime) from the person only, otherwise "example".
- No confidential process parameters (temperatures, recipes, tolerances) unless the person says
  they are public.

## Example

```yaml
script:
  - text: 'Where does a production line lose most of its time?'
  - text: 'At the Ridgeway plant, changeovers come first.'
  - text: 'Then small stops, then waiting for material.'
  - text: 'Prepare tools before the stop, and changeovers shrink.'
  - text: 'Follow for part two: small stops.'
```

Fictional names: Ridgeway Plant, Ironbridge Components, Summit Fabrication.
