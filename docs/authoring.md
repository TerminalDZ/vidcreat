# Authoring guide

Everything about an episode lives in `episodes/<id>/`:

```
episodes/ep10/
  episode.yaml   the spec (you write this)
  voice.wav      your recording (any sample rate, mono or stereo; other formats are converted with ffmpeg)
  cues.json      line start times (written by `reelforge cue`)
  assets/        optional images/SVGs referenced as assets/<file>
  out/           generated: master, share, SRT, contact sheet, publish.md
```

## 1. The spec at a glance

```yaml
meta:
  id: ep10 # slug
  series: 'SYSTEM DESIGN' # header text
  title: 'Idempotency'
  episode: 10
  preset: tiktok # tiktok | reels | shorts (presets/*.preset.yaml)
  theme: season1 # themes/<name>.theme.yaml, or a relative path
  lang: en-US # en-US (left to right) · ar-EG (right to left, English terms supported)
  publish: { cover: '…', caption: '…', hashtags: ['#systemdesign'], pinned: '…' }

audio:
  voice: voice.wav
  sfx: auto # auto | none | manual (only audio.extra and element sfx lists)
  sfx_gain_db: -16
  duck: true # duck SFX under the voice
  extra: [{ at: "l9:'boom'", sound: hit, gain_db: -3 }]

script: # one spoken sentence per line; ids default to l1, l2, …
  - text: 'Ever paid online and your connection dropped?'
  - id: twice
    text: 'And you got charged twice.'
    break: ['twice'] # force a caption break before this word
    caption: auto # auto | none | "custom caption text"

chapters:
  - { at: l1, label: '01 · THE PROBLEM' }

scenes:
  - id: hook
    at: l1 # start; end defaults to the next scene's start
    glow: red # or a list: [{ at: l1, color: red }, { at: l3, color: lime }]
    transition: crossfade # crossfade | cut | slide-up
    layout: stage # stage (between header and captions) | full (whole canvas)
    elements:
      - use: phone
        id: phone
        props: { title: 'Checkout', amount: '$49.00' }
        place: { x: 320, y: 30, w: 440, h: 880 }
        enter: { at: l1, anim: rise, dur: 0.6 }
        exit: { at: l3, anim: fade }
        states:
          - { at: "l1:'dropped'", set: { offline: true } }
        fx:
          - { at: "twice:'twice'", do: shake, amp: 22 }
          - { at: "twice:'twice'", do: flash, color: red }
```

## 2. Time expressions

| Form                              | Meaning                                                                     |
| --------------------------------- | --------------------------------------------------------------------------- |
| `12.5s` (or a YAML number `12.5`) | absolute seconds                                                            |
| `l7`                              | cue start of line `l7`                                                      |
| `l7.end`                          | start of the next line − 0.15 s                                             |
| `l7:'timeout'`                    | first word matching "timeout" (punctuation, tatweel and diacritics ignored) |
| `l7:'request'#2`                  | second match                                                                |
| `l7:"Conway's"`                   | use double quotes when the word contains `'`                                |
| `l7:'Duplicate Charge'`           | a multi-word phrase (time of its first word)                                |
| `l7.3`                            | the 4th word (0-based)                                                      |
| `@hook`, `@hook.end`              | a scene's start / end                                                       |
| any of the above `+0.4` / `-0.2`  | offset in seconds                                                           |

Word times come from your manual word marks (Cues mode, word mode) or are estimated by letter count
within the line. Every expression is validated; errors name the closest valid alternative. In the
editor you rarely type these: the **target** button and timeline snapping write them for you.

Arabic works the same way: `l7:'مرتين'` anchors to an Arabic word, and English terms inside Arabic
sentences (`الـ client`) are matched as written.

## 3. Placing elements

Stage coordinates: 1080 wide × 1000 high, origin at the top-left of the stage (canvas y = 270 for TikTok).

- `place: { x, y, w, h }` — explicit box (integers)
- `place: { center: true, w, h }` — centered
- `place: { anchor: top|bottom|left|right|center, w, h, margin }`
- no `place` → centered at the component's default size, or laid out by a scene helper:
  - `row: { gap, align, y, h }` — elements side by side
  - `column: { gap, align, x, w }` — stacked
  - `columns: 2` (+ `gutter`, element `col: 0|1`) — lanes
- `size: { w, h }` overrides the default size inside helpers.
- `layer: overlay` puts an element on top and exempts it from the overlap rule (V-8).

Keep content out of the platform UI: the editor's **Z** overlay shows the safe zones of the preset. In the
editor you can simply drag and resize elements; it writes `place` for you.

## 4. Animations

`enter.anim`: `pop` (default), `rise`, `slide-l`, `slide-r`, `fade`, `draw`, `type`, `count`, `flip`,
`zoom`, `glitch`, `stamp`, `none`. Parameters: `dur`, `s0`, `dy`, `dist`, `cps`, `rot`, `amp`.
`exit.anim`: `fade`, `pop`, `rise`, `sink`, `slide-l`, `slide-r`, `zoom`, `none`.
`fx[].do`: `shake` (`target: camera` shakes the whole stage), `flash` (full-frame color hit),
`glitch`, `pulse` (`rate`), `bump`. Flashes add a `hit` sound and glitches a `glitch` sound unless
`sound: none`.

States: `states: [{ at, set: { … } }]` — each component documents the keys it reacts to
(for example `node.status`, `phone.offline`, `chip.strike`, `grid.tiles`). See [components.md](components.md).

## 5. Sound effects

With `audio.sfx: auto` components emit their default sounds (title → whoosh, stamp → hit, table row → ding,
lane step → tick, …). Disable per element with `sfx: none`, or give a list
`sfx: [{ at: l4, sound: ding }]`. Sounds: `whoosh hit ding err glitch tick tap typing`. Events of the
same sound closer than 80 ms are merged.

## 6. Themes and presets

Themes (`themes/*.theme.yaml`) hold every color, font, size and motion token and can `extends:`
another theme. `chrome.grain_fps` (default 0, a static texture) controls how often the film grain
changes; animated grain multiplies the file size (see ADR-011). Presets (`presets/*.preset.yaml`) hold the canvas, header/stage/caption positions,
safe-zone rectangles, share size and maximum duration — edit them without touching code.

## 7. Validation rules

| Rule | Level | Meaning                                                |
| ---- | ----- | ------------------------------------------------------ |
| V-1  | error | schema violation (with did-you-mean)                   |
| V-2  | error | unresolvable time expression                           |
| V-3  | error | missing/out-of-order cues                              |
| V-4  | warn  | voice changed since cues were marked, or voice missing |
| V-5  | error | exit before enter, or enter outside the scene          |
| V-6  | warn  | element box outside the stage/canvas                   |
| V-7  | warn  | element in a platform UI zone                          |
| V-8  | warn  | two visible base elements overlap > 15%                |
| V-9  | warn  | text overflows its box (headless measurement)          |
| V-10 | warn  | caption wraps over `max_lines`                         |
| V-11 | info  | nothing enters in a scene's first 1.5 s                |
| V-12 | warn  | element enters < 0.1 s before its scene ends           |
| V-13 | error | unknown component or font                              |

`reelforge validate <id> --strict` fails on warnings too (use it in CI).
