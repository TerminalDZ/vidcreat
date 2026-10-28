# Government and public services

**Audience:** all residents, including older people and non-native speakers.
**Tone:** neutral, plain, inclusive, step by step; MSA for Arabic.
**Theme:** `civic` (sober navy or green, high contrast); fallback `minimal`.

## Typical episodes

| Episode                                | Blueprint         | Components                             |
| -------------------------------------- | ----------------- | -------------------------------------- |
| How to renew a document online         | `process-steps`   | `steps`, `phone`                       |
| What to bring to an appointment        | `process-steps`   | `checklist`                            |
| Deadlines for a program                | `timeline`        | `timeline`, `chip`                     |
| Online vs in person                    | `comparison`      | `comparison` (no winner)               |
| Who to contact (fictional departments) | `quote` or `hook` | `org-chart`, `node`                    |
| A public number explained              | `stat-reveal`     | `counter`, `bar-chart` (person's data) |

## Compliance

- Politically neutral: no parties, candidates, opinions or persuasion.
- No legal advice; refer to the official office of the fictional city or agency.
- Rules, fees and deadlines exactly as the person provides them, with "check the official website
  for your case".
- Accessibility: high contrast, captions always on, short lines, no flashing effects
  (`fx: flash`/`glitch` off).
- No real agencies, officials, seals or emblems.

## Example

```yaml
script:
  - text: 'Renewing your residence card? It takes three steps.'
  - text: 'Sign in to the City of Westbrook portal.'
  - text: 'Upload a recent photo and your current card.'
  - text: 'Pay the fee, and track your request online.'
  - text: 'Check the official website for your case.'
```

Fictional names: City of Westbrook, Riverside Municipal Services, Department of Public Records.
