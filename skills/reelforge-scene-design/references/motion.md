# Motion

## Enter animations

| `anim`                                         | Feels like                       | Use for                         |
| ---------------------------------------------- | -------------------------------- | ------------------------------- |
| `reveal`                                       | Title card sliding out of a mask | Big titles                      |
| `pop`, `spring`                                | Scale up with overshoot          | Chips, icons, badges            |
| `rise`                                         | Fade in while moving up          | Cards, diagrams, code, CTA      |
| `wipe`                                         | Revealed from the start edge     | Timelines, meters, labels       |
| `blur`, `fade`                                 | Calm focus-in                    | Quotes, background-ish elements |
| `drop`                                         | Falls in and bounces             | A result, a verdict             |
| `stamp`                                        | Slams in                         | `stamp` elements                |
| `type`                                         | Types characters                 | Code, terminal text             |
| `draw`                                         | Line draws itself                | Arrows                          |
| `zoom`, `flip`, `glitch`, `slide-l`, `slide-r` | Accents                          | Use sparingly                   |

`ease`: `smooth` (default), `snappy`, `gentle`, `linear`. `dur` overrides the duration
(theme default 0.45 s).

## Exits

`exit: { at, anim }` with `fade`, `pop`, `rise`, `sink`, `slide-l`, `slide-r`, `zoom`, `blur`,
`wipe`. Exit on the line or word that replaces the element, never in the last 0.1 s of a scene.

## Scenes

- `transition`: `crossfade` (default), `cut`, `slide-up`, `zoom`, `push`, `blur`.
  Use `push`/`zoom` at chapter changes, `cut` for punchlines; vary them.
- `camera`: `still`, `drift`, `push-in`, `pull-out`. Slow and eased; good on single-hero scenes.
- `glow`: background color per scene (`red` for problems, `lime` for solutions, `cyan`/`violet`
  for neutral explanation, `amber` for warnings), or a list `[{ at, color }]` to shift mid-scene.

## Emphasis

- `fx: [{ at, do: shake|flash|glitch|pulse|bump }]`; `target: camera` shakes the whole frame.
  One hit per scene, on the most important word.
- `states: [{ at, set: { … } }]` changes props over time (`node.status: err`, `chip.strike`,
  `phone.offline`). A state change is often better than a new element.

## Rhythm

- Something new every 1.5–3 s; nothing for 4 s feels frozen.
- Never more than two things moving at once.
- Repetition is fine for a series signature (same hook animation), not for every element.

```yaml
elements:
  - use: node
    id: api
    props: { title: 'API', icon: server }
    place: { x: 390, y: 300, w: 300, h: 170 }
    enter: { at: "l2:'API'", anim: pop }
    states:
      - { at: "l3:'overloaded'", set: { status: err } }
    fx:
      - { at: "l3:'overloaded'", do: shake, amp: 18 }
```
