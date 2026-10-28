---
name: reelforge-industry-playbooks
description: >-
  Use when a ReelForge video is for a specific industry or organization type (healthcare, real estate, ports and logistics, education, finance, food, retail, government, tourism, manufacturing, events and NGOs, tech): audience, tone, episode ideas, components, theme and compliance limits.
---

# Industry playbooks

Each industry has its own audience, vocabulary and limits. Read the matching reference before
writing the script; it lists typical episodes, the blueprints and components that fit, the theme
and the compliance rules.

## How to use a playbook

1. Identify the industry from the request and load its reference:
   `get_guide reelforge-industry-playbooks/<industry>` (for example `…/healthcare`).
2. Take the audience and tone into the script (`reelforge-script-writing`).
3. Pick an episode type from the playbook and its blueprint (Tier 2) or a template whose name or
   description matches the industry (Tier 1, `list_templates`).
4. Set `meta.theme` to the suggested theme; if it is not installed (V-1 "Theme not found"), use
   `default` or create it (`reelforge-brand-and-themes`).
5. Apply the compliance notes before you validate; they are not optional.

| Industry           | Reference                                        | Theme        |
| ------------------ | ------------------------------------------------ | ------------ |
| Healthcare         | [healthcare](references/healthcare.md)           | `clinical`   |
| Real estate        | [real-estate](references/real-estate.md)         | `estate`     |
| Ports & logistics  | [ports-logistics](references/ports-logistics.md) | `harbor`     |
| Education          | [education](references/education.md)             | `campus`     |
| Finance            | [finance](references/finance.md)                 | `ledger`     |
| Food & hospitality | [food](references/food.md)                       | `bistro`     |
| Retail             | [retail](references/retail.md)                   | `retail`     |
| Government         | [government](references/government.md)           | `civic`      |
| Tourism            | [tourism](references/tourism.md)                 | `voyage`     |
| Manufacturing      | [manufacturing](references/manufacturing.md)     | `industrial` |
| Events & NGOs      | [events-ngo](references/events-ngo.md)           | `editorial`  |
| Tech               | [tech](references/tech.md)                       | `default`    |

Neutral alternatives for any industry: `minimal` (calm, few effects) and `bold` (high energy).

## Rules for every industry

- **No real brands, people or organizations.** Use fictional ones: "Northwind Hospital", "Port of
  Azur", "Cedar Homes", "Brightway Bank", "Maple Street Bistro". Logos only from the person's own
  `assets/`.
- **No professional advice**: no diagnosis, treatment, dosage, investment, tax or legal advice.
  Explain how things work and point to a qualified professional.
- **Numbers must come from the person** or be clearly illustrative ("for example, 5 days"). Never
  invent statistics presented as facts.
- **No guarantees** ("always", "100%", "risk-free") and no before/after claims about health or
  money.
- **Inclusive and respectful** wording; no stereotypes in examples or icons.

## Good and bad

Good: fictional organization, explains a process, sends to a professional.

```yaml
script:
  - text: 'What happens after you check in at Northwind Hospital?'
  - text: 'A nurse records your vital signs first.'
  - text: 'Questions about your results? Ask your care team.'
```

Bad: a real-sounding brand, a medical claim and advice.

```yaml
script:
  - text: 'This supplement cures migraines in three days, guaranteed.'
  - text: 'Stop your medication and try it instead.'
```

## Checklist

- [ ] The industry reference was read; tone and audience match it.
- [ ] Only fictional organizations, people and products appear (script, props, publish).
- [ ] No advice, diagnosis, guarantees or invented statistics.
- [ ] Theme set (or `default` with a note to the person).
- [ ] Compliance notes from the reference applied; disclaimers where the reference asks for them.
