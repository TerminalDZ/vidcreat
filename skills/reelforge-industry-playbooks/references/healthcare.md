# Healthcare

**Audience:** patients and families, often anxious or in a hurry; staff for internal explainers.
**Tone:** calm, warm, plain language (reading age ~12), MSA for Arabic institutional content.
**Theme:** `clinical` (light, soft blue/teal); fallback `minimal`. Glow `cyan` or `lime`; avoid red
except for genuine warnings.

## Typical episodes

| Episode                               | Blueprint       | Components                              |
| ------------------------------------- | --------------- | --------------------------------------- |
| What happens at your first visit      | `process-steps` | `steps`, `icon` (user, clock)           |
| How to prepare for a lab test         | `process-steps` | `checklist`                             |
| Where to go: urgent care vs emergency | `comparison`    | `comparison` (no winner), `node`        |
| Opening hours and appointment options | `timeline`      | `timeline`, `chip`                      |
| Meet the department (fictional staff) | `quote`         | `org-chart`, `quote`                    |
| Wait time explained                   | `stat-reveal`   | `counter` with a person-provided number |

## Compliance

- No diagnosis, treatment recommendations, dosages, cure or efficacy claims.
- No before/after patient imagery or outcomes; no testimonials about results.
- No real patient data, names or recognizable cases; fictional staff only.
- Include "This video is general information, not medical advice. Ask your care team." in the
  caption or as a final `label` when the topic touches symptoms or treatment.
- Emergencies: say "call your local emergency number"; do not print a specific number unless the
  person provides it.

## Example

```yaml
script:
  - text: 'First visit at Northwind Hospital? Here is what happens.'
  - text: 'At reception, bring your ID and insurance card.'
  - text: 'A nurse records your vital signs.'
  - text: 'Then you meet your doctor in a private room.'
  - text: 'Questions about your results? Ask your care team.'
  - text: 'Follow for part two: preparing for a lab test.'
```

Fictional names: Northwind Hospital, Lakeside Clinic, Riverbend Medical Center.
