# Templates and packs

An **industry pack** bundles what one sector needs: a theme, two or three **templates**, recommended scene
blueprints, an example episode in English and Arabic, and a playbook for AI assistants. A template is a
complete episode (script, scenes, timing) with named fields, called **slots**, such as an organization
name, a number or a call-to-action keyword. Filling the slots gives a valid, designed episode in seconds;
you then refine it like any other episode.

The [pack catalog](../reference/packs.md) lists every pack, template and slot, generated from the files in
`packs/`.

## Create an episode from a template

From the command line:

```bash
reelforge packs                      # every pack and template with its slots (--json for details)
reelforge new first-visit --pack healthcare --template patient-journey --lang en \
  --slot "org=Northwind Hospital" --slot wait=10
```

`--lang ar` uses the Arabic version of the template. `--slot key=value` can be repeated; slots you leave
out keep their defaults, and a value that is too long or out of range is rejected before anything is
written. Without `--template` the pack's first template is used. The episode gets draft cues, so it
previews immediately (`reelforge snap first-visit --every 5`); change the texts in the editor or in
`episode.yaml`.

From the dashboard, click **+ New episode** and choose **Start from template**: pick a pack and a
template, fill in the fields (text fields show their length limit, numbers their range, and every field
starts with its default), choose the language and click **Create**.

From an AI assistant, the Tier 1 tools do the same: `list_templates` returns the templates with their
slots, and `create_from_template` takes the episode id, pack, template, language and a flat object of slot
values:

```json
{
  "id": "first-visit",
  "pack": "healthcare",
  "template": "patient-journey",
  "lang": "en",
  "slots": { "org": "Northwind Hospital", "wait": 10, "keyword": "VISIT" }
}
```

## Slots

| Slot type | Value                                  | Limits                       |
| --------- | -------------------------------------- | ---------------------------- |
| `text`    | a short text (default type)            | `max` characters             |
| `number`  | a number                               | `min` and `max` values       |
| `color`   | a theme color name (`lime`, `cyan`, …) | must be a theme color or CSS |

Missing slots keep their defaults, which exist in both languages. Respect the length limits: text that is
too long is the most common cause of V-9 (text overflows its box).

## Scene blueprints

Blueprints are named, parameterized scenes used by the `add_scene` tool (Tier 2) and by the templates:
`hook`, `problem-solution`, `stat-reveal`, `comparison`, `process-steps`, `timeline`, `before-after`,
`bar-stats`, `quote`, `cta`, `map-route`, `appointment` and `chat` (13 in all). Each turns a few flat fields
into positioned elements that enter on the right words. `list_blueprints` returns their fields.

## Example episodes

Each pack has an example in English and Arabic under `packs/<pack>/examples/`. Open one in the editor or
render it without a recording:

```bash
reelforge edit packs/healthcare/examples/first-visit-en
reelforge render packs/healthcare/examples/first-visit-ar --silent
```

## Tutorials by sector

Each [tutorial](tutorials/index.md) makes one short video with one pack, with the tone and compliance
notes for that sector.

## Make your own pack

Packs are plain files: a `pack.yaml` manifest validated when it is loaded, and one template file per
language with `{{slot}}` placeholders. A project can add its own packs in `<project>/packs/`; a pack with
the same id as a bundled one replaces it. See [Contributing](contributing.md#add-an-industry-pack).

```yaml
# <project>/packs/clinic/pack.yaml
id: clinic
name: { en: My clinic, ar: عيادتي }
description: { en: Patient guides, ar: أدلة للمرضى }
theme: clinical
templates:
  - id: first-visit
    title: { en: First visit, ar: الزيارة الأولى }
    description: { en: What happens at a first visit, ar: ماذا يحدث في الزيارة الأولى }
    slots:
      org: { label: Clinic name, max: 26, default: { en: Lakeside Clinic, ar: عيادة ليكسايد } }
      wait: { label: Check-in minutes, type: number, min: 1, max: 120, default: 10 }
    files: { en: templates/first-visit.en.yaml, ar: templates/first-visit.ar.yaml }
```

The easiest way to write a template is to copy a finished episode and replace the parts that change:

- Put text slots inside single-quoted YAML strings (`text: 'Welcome to {{org}}'`); values are escaped for
  them. Numbers go unquoted (`value: {{wait}}`). `{{id}}` is the episode id (`meta.id: '{{id}}'`).
- Anchor entrances on words that are **not** slots (`"l2:'bring'"`), or on line starts and offsets
  (`l2+0.4`): a slot value may not contain the word you anchored on.
- Size every text box for the slot's `max` length, and give every script line something that enters
  while it is spoken.
- Check it with `reelforge new test --pack <your-pack> --slot org=<a long name>` and
  `reelforge validate test`, in both languages. Template files are excluded from Prettier, because they
  are not valid YAML until they are filled.
