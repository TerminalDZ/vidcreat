# Visual QA

## Choosing preview times

| Moment                    | Expression                      | Why                                   |
| ------------------------- | ------------------------------- | ------------------------------------- |
| Hook settled              | `"l1+1.2"`                      | First impression, the cover candidate |
| Hero settled              | `"l3:'bucket'+0.8"`             | Animation done, final layout          |
| Busiest moment of a scene | the last element's enter `+0.8` | Maximum overlap risk                  |
| Before a scene change     | `"l6.end-0.3"`                  | Exits ran, nothing lingers            |
| CTA                       | `"l9+1.5"`                      | Keyword typed, ending readable        |

Use `width: 540` when you need to read small text; 360 (default) is enough for layout.

## Reading the layout text

Coordinates are **canvas** coordinates (1080×1920), not stage: subtract the stage top (270 on TikTok
and Reels, 250 on Shorts) from `y` to get back to `place.y`.

| Line                                             | Action                                                        |
| ------------------------------------------------ | ------------------------------------------------------------- |
| `a × b 34% (V-8)`                                | Move or resize one, exit the other first, or make one overlay |
| `a × b 8%`                                       | Allowed, but check that text is not covered                   |
| `el ∩ "right-rail" (…)`                          | Reduce `place.x + w` to ≤ 920 (stage) or move it up           |
| `el ∩ "bottom" (…)`                              | Only possible in `layout: full`; move it up                   |
| `· entering`                                     | Preview again later for the settled layout                    |
| `(nothing visible)`                              | Dead frame: bring something in earlier                        |
| `Caption:` text mismatching the visible elements | Re-anchor the element to the word being spoken                |

## Common visual faults and fixes

| Fault                                    | Fix                                                         |
| ---------------------------------------- | ----------------------------------------------------------- |
| Title wraps to 3+ lines                  | ≤ 7 words, or `size` 90–100, or a wider/taller `place`      |
| Text clipped at the bottom of a card     | Increase `place.h` or reduce `fontSize`                     |
| Everything at the top, empty lower half  | Move the composition down to center it, or enlarge the hero |
| Elements appear before they are spoken   | Anchor to the naming word instead of the line start         |
| Old elements linger behind new ones      | `exit` on the line that replaces them                       |
| Two elements animate at the same instant | Offset one by `+0.3` or anchor it to a later word           |
| Same animation everywhere                | Vary per role: reveal titles, pop chips, rise cards         |
| Low-contrast text                        | Use `ink`, or fix the theme (`reelforge-brand-and-themes`)  |
