# Hooks and calls to action

## Hook patterns

| Pattern           | Template                               | Example                                               |
| ----------------- | -------------------------------------- | ----------------------------------------------------- |
| Painful question  | "Ever <frustrating thing>?"            | "Ever paid online and got charged twice?"             |
| Surprising number | "<number> <unit> <unexpected fact>."   | "Five days. That is how long a container waits."      |
| Myth              | "Everyone says <belief>. It is wrong." | "Everyone says cranes cause port delays. They don't." |
| Visible result    | "This <thing> went from <A> to <B>."   | "This kitchen went from 40 to 12 minutes per order."  |
| Direct promise    | "In 30 seconds you will know <skill>." | "In 30 seconds you will read a nutrition label."      |

Avoid greetings, channel names, "today we will talk about" and long setups. The first spoken
word should already carry meaning.

Pair the hook with a big visual on the first meaningful word: a `title` with an accent word
(`anim: reveal`), a `counter` on the number, or a `stamp` on the shocking word.

## Payoff

One sentence the viewer can repeat: "Send documents before arrival." Give it its own scene and a
calm visual (title or checklist), not new information.

## Calls to action

| CTA type          | Line                                     | Visual                                           |
| ----------------- | ---------------------------------------- | ------------------------------------------------ |
| Comment keyword   | "Comment SLOTS for part two."            | `cta` with `keyword: 'SLOTS'`                    |
| Next episode      | "Next: how truck slots work. Follow."    | `cta` with `next: 'How truck slots work'`        |
| Save              | "Save this before your next shipment."   | `title` + `icon: { name: check }`                |
| Visit (fictional) | "Ask your Northwind care team about it." | `title`; never invent real URLs or phone numbers |

One CTA per video. Put the pinned comment and caption in `meta.publish` so they match the spoken
CTA.

```yaml
scenes:
  - id: outro
    at: l9
    elements:
      - use: cta
        id: next
        props: { next: 'How truck slots work', keyword: 'SLOTS' }
        place: { x: 60, y: 180, w: 860, h: 560 }
        enter: { at: "l9:'Comment'", anim: rise }
```
