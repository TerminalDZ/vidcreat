# Layout recipes

Stage coordinates (1080×1000). Every recipe respects the 60 px margins and keeps `x + w ≤ 920`
below stage y 600. Adjust heights to your text; run `validate_episode` for V-9 (overflow).

## Title over hero

| Element | place                                |
| ------- | ------------------------------------ |
| title   | `{ x: 60, y: 80, w: 960, h: 220 }`   |
| hero    | `{ x: 160, y: 340, w: 760, h: 560 }` |

## Big number with a kicker and a chip

| Element | place                                |
| ------- | ------------------------------------ |
| label   | `{ x: 140, y: 60, w: 640, h: 60 }`   |
| counter | `{ x: 140, y: 140, w: 800, h: 320 }` |
| chip    | `{ x: 270, y: 540, w: 540, h: 90 }`  |

## Two nodes and an arrow (cause → effect, A → B)

| Element      | place                                    |
| ------------ | ---------------------------------------- |
| node A       | `{ x: 80, y: 260, w: 340, h: 170 }`      |
| node B       | `{ x: 580, y: 260, w: 340, h: 170 }`     |
| arrow        | `from: a.right`, `to: b.left` (no place) |
| caption chip | `{ x: 270, y: 520, w: 540, h: 90 }`      |

## Three chips in a column

Use a scene helper instead of coordinates:

```yaml
scenes:
  - id: options
    at: l5
    column: { gap: 40, align: center, x: 200, w: 680 }
    elements:
      - { use: chip, id: opt_a, props: { text: 'Walk-in' }, enter: { at: "l5:'walk-in'" } }
      - { use: chip, id: opt_b, props: { text: 'Online' }, enter: { at: "l5:'online'" } }
      - { use: chip, id: opt_c, props: { text: 'Phone' }, enter: { at: "l5:'phone'" } }
```

## Full-width diagram

`steps`, `comparison`, `bar-chart`: `{ x: 60, y: 120, w: 860, h: 620 }`. The width stops at 920 so
the lower half stays clear of the right rail.

## Replace, don't stack

When a scene has two phases, exit the first group on the line that starts the second:

```yaml
elements:
  - use: chip
    id: myth
    props: { text: 'Cranes are slow', strike: "l7:'not'" }
    place: { x: 190, y: 300, w: 700, h: 110 }
    enter: { at: "l7:'cranes'", anim: pop }
    exit: { at: l8, anim: fade }
  - use: title
    id: truth
    props: { text: 'Missing **documents**' }
    place: { x: 60, y: 300, w: 960, h: 240 }
    enter: { at: "l8:'documents'", anim: reveal }
```
