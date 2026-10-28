# Ports and logistics

**Audience:** importers and exporters, freight forwarders, drivers, port staff, students.
**Tone:** precise, operational, numbers-driven; English terms kept in Arabic (`الـ container`,
`الـ customs`).
**Theme:** `harbor` (deep navy, signal orange or cyan accent); fallback `default`.

## Typical episodes

| Episode                                  | Blueprint       | Components                                 |
| ---------------------------------------- | --------------- | ------------------------------------------ |
| A container's journey from ship to truck | `process-steps` | `flow` (stages, moving token)              |
| Shipping route and transit time          | `map-route`     | `node` + `arrow` with `packet`, `timeline` |
| Dwell time and what drives it            | `stat-reveal`   | `counter`, `bar-chart`                     |
| Documents needed for customs             | `process-steps` | `checklist`                                |
| Sea vs air freight                       | `comparison`    | `comparison`                               |
| Peak season capacity                     | `stat-reveal`   | `meter` with `threshold`, `grid` (slots)   |

## Compliance

- No real ports, carriers, vessels or terminal operators; fictional ones only.
- Customs and trade rules vary by country: present them as examples and point to the local customs
  authority or a licensed broker.
- Times, fees and volumes from the person, otherwise labeled "example".
- No security-sensitive details (gate procedures, inspection methods).

## Example

```yaml
script:
  - text: 'Why does a container wait five days at the port?'
  - text: 'At the Port of Azur, it starts at the quay.'
  - text: 'Customs checks the documents next.'
  - text: 'Then a truck slot is booked for pickup.'
  - text: 'Send documents early and the wait drops.'
  - text: 'Comment SLOTS for part two.'
```

Fictional names: Port of Azur, Bluewater Freight, Northgate Logistics Hub.
See `reelforge-make-video/full-example` for a complete episode in this industry.
