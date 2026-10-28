# Time expressions

Every key named `at` or `until` (at any depth, including inside props), and `strike`/`highlight`
when they are not booleans, takes a time expression.

| Form                             | Meaning                                                                  |
| -------------------------------- | ------------------------------------------------------------------------ |
| `12.5s` or `12.5`                | Absolute seconds                                                         |
| `l7`                             | Cue (start) of line `l7`                                                 |
| `l7.end`                         | Start of the next line − 0.15 s                                          |
| `l7:'timeout'`                   | First word matching "timeout" (punctuation, tatweel, diacritics ignored) |
| `l7:'request'#2`                 | Second match                                                             |
| `l7:"Conway's"`                  | Double quotes when the word contains `'`                                 |
| `l7:'Duplicate Charge'`          | A phrase: the time of its first word                                     |
| `l7.3`                           | The 4th word (0-based)                                                   |
| `@hook`, `@hook.end`             | A scene's start / end                                                    |
| any of the above `+0.4` / `-0.2` | Offset in seconds                                                        |

Line ids default to `l1`, `l2`, … by position. A line with its own `id: twice` is addressed as
`twice:'word'`. Inserting a line in the middle renumbers positional ids, so after inserting lines,
re-check every anchor (`validate_episode` reports V-2 with the closest valid alternative).

## YAML quoting

```yaml
scenes:
  - id: hook
    at: l1
    elements:
      - use: title
        props: { text: 'Charged **twice**' }
        enter: { at: "l1:'twice'", anim: pop }
        exit: { at: 'l2.end-0.2', anim: fade }
```

- Quote any expression that contains `:` or `'`.
- `#2` must stay inside the quotes: `"l3:'request'#2"`.

## Where word times come from

1. Words marked by hand in word mode (exact).
2. Words placed by `align_cues` (`words: true`, the default).
3. Otherwise estimated from letter counts within the line.

Offsets small and positive (`+0.2` to `+0.8`) make an element appear just as the word lands;
negative offsets anticipate it (good for a camera move that leads into a word).

## Arabic

`l4:'مرتين'` anchors to an Arabic word. English terms inside Arabic lines are matched as written:
`l2:'server'` in `'الـ server خصم الفلوس'`.
