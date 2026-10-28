---
name: reelforge-scene-design
description: >-
  Use when designing or fixing ReelForge scenes and elements: stage coordinates, margins and platform safe zones, visual hierarchy, choosing a component for numbers, processes, comparisons, places, people or time, motion rules and how much to show per scene.
---

# Design scenes

A scene shows one idea. It starts on a script line (`at: l3`), ends where the next scene starts,
and holds a few elements that enter on the words that name them.

## Stage and safe zones

All `place` coordinates are **stage coordinates**: 1080 wide × 1000 high, origin top-left. The
stage sits between the header and the captions (canvas y 270–1270 on TikTok and Reels, 250–1250 on
Shorts). Platform UI covers parts of the canvas; V-7 warns when an element touches it.

| Rule                        | Value                                          |
| --------------------------- | ---------------------------------------------- |
| Side margins                | `x ≥ 60`, `x + w ≤ 1020`                       |
| Top / bottom breathing room | `y ≥ 40`, `y + h ≤ 960`                        |
| Right rail, lower stage     | below stage y 600: `x + w ≤ 920` (all presets) |
| Main focus area             | stage y 100–800, centered horizontally         |

Per preset (from `presets/*.preset.yaml`, canvas coordinates → stage):

| Preset   | Stage on canvas | Right rail (likes, comments) | In stage coordinates     | Captions at canvas y |
| -------- | --------------- | ---------------------------- | ------------------------ | -------------------- |
| `tiktok` | y 270–1270      | x ≥ 940 from canvas y 900    | x ≥ 940 from stage y 630 | 1300                 |
| `reels`  | y 270–1270      | x ≥ 960 from canvas y 1000   | x ≥ 960 from stage y 730 | 1290                 |
| `shorts` | y 250–1250      | x ≥ 960 from canvas y 1000   | x ≥ 960 from stage y 750 | 1280                 |

The bottom zones (canvas y ≥ 1500–1560) lie below the stage, under the captions; only
`layout: full` scenes can reach them. Design for TikTok and the layout is safe on all three.

## Hierarchy and density

- **One hero per scene**: the element that carries the idea (title, counter, diagram) takes
  40–70% of the stage.
- **At most 3–4 visible elements at once**, counting arrows and chips. More than that: `exit` the
  old ones or split the scene.
- **Text sizes**: titles 80–130 px and ≤ 7 words; body 36–56 px; labels ≥ 24 px. Nothing smaller
  than 24 px survives a phone screen.
- **Reading order**: top to bottom, in the order things are spoken.
- **Fill the stage**: a lone small element at the top leaves a dead lower half. Center the
  composition vertically or enlarge the hero.
- Base elements must not overlap (V-8, > 15%). Use `layer: overlay` only for stamps, badges and
  arrows that are meant to sit on top.

## Choose a component

| Content         | First choice                                 | Alternatives                                                       |
| --------------- | -------------------------------------------- | ------------------------------------------------------------------ |
| One number      | `counter` (big, counts on the number word)   | `stat-card` (with delta), `progress-ring` (percent)                |
| Several numbers | `bar-chart`, `ranking`                       | `donut-chart` (shares), `line-chart` (trend), `table`              |
| A process       | `steps` (3–6 steps)                          | `flow` (pipeline), `cycle` (loop), `lanes` (parallel), `checklist` |
| A comparison    | `comparison` (A vs B rows, winner)           | `before-after`, `table`, `matrix-2x2`, struck `chip`               |
| Places          | `node` boxes + `arrow` with `packet` (route) | `flow` (stops in order), `icon: globe`; `map-route` blueprint      |
| People, roles   | `org-chart`, `quote` (fictional speaker)     | `node` with `icon: user`/`users`, `icon`                           |
| Time            | `timeline` (markers on dates/phases)         | `steps` horizontal, `counter` with a time suffix, `line-chart`     |
| A term or claim | `title` with `**accent**`                    | `chip`, `label`, `stamp` for a verdict                             |
| Code, systems   | `code`, `node` + `arrow`, `grid`, `bucket`   | `phone` for app flows                                              |

Check props with `get_component_schema` before use; the full matrix with sizes is in
[component-matrix](references/component-matrix.md).

## Motion

- Enter **on the word** that names the element: `enter: { at: "l3:'customs'" }`.
- Something enters within the first 1.5 s of every scene (V-11 otherwise).
- Leave ≥ 0.3 s between entrances; the eye follows one thing at a time.
- Vary animations: `reveal` for big titles, `pop`/`spring` for chips and icons, `rise` for cards
  and diagrams, `wipe` for timelines and meters; a `counter` counts by itself from its keyframes.
- Scene transitions: `crossfade` by default, `push` or `zoom` at chapter changes, `cut` for a
  punchline. Camera `drift` or `push-in` on calm scenes, `still` on busy ones.
- At most one `fx` hit (shake, flash, glitch) per scene, on the most important word.

More in [motion](references/motion.md); ready-made coordinates in
[layout-recipes](references/layout-recipes.md).

## Good and bad

Good: a hero and one support element, inside the margins, entering on their words.

```yaml
scenes:
  - id: limit
    at: l4
    glow: cyan
    elements:
      - use: title
        id: limit_title
        props: { text: 'One **bucket** per user' }
        place: { x: 60, y: 80, w: 960, h: 220 }
        enter: { at: "l4:'bucket'", anim: reveal }
      - use: bucket
        id: tokens
        props: { capacity: 5, keyframes: [{ at: "l5:'empty'", tokens: 0 }], rate: '1 token/s' }
        place: { x: 320, y: 340, w: 440, h: 560 }
        enter: { at: "l5:'tokens'", anim: rise }
```

Bad: five elements at once, overlapping boxes, text under the right rail, everything popping at the
scene start.

```yaml
scenes:
  - id: crowded
    at: l4
    elements:
      - {
          use: title,
          props: { text: 'Buckets, tokens, refills, limits and errors' },
          place: { x: 0, y: 0, w: 1080, h: 200 },
        }
      - { use: bucket, props: { capacity: 5 }, place: { x: 100, y: 150, w: 440, h: 560 } }
      - { use: chip, props: { text: '429' }, place: { x: 700, y: 700, w: 340, h: 84 } }
      - { use: node, props: { title: 'API' }, place: { x: 400, y: 300, w: 300, h: 170 } }
      - {
          use: meter,
          props: { keyframes: [{ at: l4, value: 80 }] },
          place: { x: 60, y: 800, w: 1000, h: 180 },
        }
```

## Checklist

- [ ] Every box inside `x 60–1020`, `y 40–960`; lower stage `x + w ≤ 920`.
- [ ] One hero per scene; at most 3–4 visible elements at any moment.
- [ ] Titles ≤ 7 words at 80–130 px; no text below 24 px.
- [ ] Component chosen from the matrix; props checked against the schema.
- [ ] Each element enters on a related word; something enters in the first 1.5 s.
- [ ] No V-6, V-7, V-8 or V-9 warnings; preview frames show no dead half of the stage.
