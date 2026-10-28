# Tourism and travel

**Audience:** travelers planning a trip, visitors on site, travel agents.
**Tone:** inviting, vivid, practical tips; dialect or MSA depending on the market.
**Theme:** `voyage` (sunset or sea accent on a deep base); fallback `bold`.

## Typical episodes

| Episode                                  | Blueprint       | Components                             |
| ---------------------------------------- | --------------- | -------------------------------------- |
| A 3-day itinerary                        | `timeline`      | `timeline`, `steps` horizontal         |
| Getting from the airport to the old town | `map-route`     | `node` + `arrow` with `packet`, `chip` |
| Best time to visit                       | `stat-reveal`   | `bar-chart` (person's data), `icon`    |
| Train vs bus                             | `comparison`    | `comparison`                           |
| Packing checklist                        | `process-steps` | `checklist`                            |
| A (fictional) guide's tip                | `quote`         | `quote`                                |

## Compliance

- No real hotels, airlines, tour operators or booking platforms; fictional names only.
- Prices, schedules and visa rules only from the person, with "check before you travel".
- Respect local culture and sacred sites; no stereotypes.
- No safety guarantees; for health and entry requirements, point to official sources.

## Example

```yaml
script:
  - text: 'Three days in Azur Bay? Here is the plan.'
  - text: 'Day one: the old harbor and the fish market.'
  - text: 'Day two: a boat trip to the islands.'
  - text: 'Day three: the hill fort at sunset.'
  - text: 'Save this for your trip, and check times before you go.'
```

Fictional names: Azur Bay, Voyager Tours, Seaside Inn, Old Harbor Museum.
