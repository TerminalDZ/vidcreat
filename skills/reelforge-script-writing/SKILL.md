---
name: reelforge-script-writing
description: >-
  Use when writing or revising the spoken script of a ReelForge episode (script lines in episode.yaml), in English or Arabic: hooks, pacing (V-14), caption length, one idea per line, Arabic with English terms, and the closing call to action.
---

# Write the script

The script is the spine of the video: every scene starts on a line and every element enters on a
word. Write it for the ear first and for captions second.

## Rules

- **Hook in the first 2 seconds.** Line 1 is a question or a surprising fact the viewer cares
  about. The voice must start within 3 s of the recording (V-14 warns after `HOOK_MAX_START` = 3 s).
- **One idea per line.** One spoken sentence, 4–12 words. A line that needs "and" twice is two
  lines.
- **Pace: about 2.3 words per second.** 45 s ≈ 100–110 words; 30 s ≈ 70 words. V-14 warns above
  3.5 words/s (`PACE_MAX_WPS`), measured from a line's cue to the next.
- **Name things on screen.** Put the concrete noun or number that the visual shows in the line
  (`bucket`, `five days`, `customs`): elements enter on those words.
- **Captions:** at most 34 characters per caption line and 2 lines (theme `captions.max_chars`,
  `max_lines`; V-10 warns when a caption wraps more). Short lines caption cleanly; use
  `break: ['word']` to force a break before a word.
- **End with a call to action**: one action (follow, comment a keyword, save), tied to the next
  episode when there is one.
- **Numbers:** say them the way you want them shown; write digits or words consistently, because
  word anchors match the text as written (`l2:'five'` vs `l2:'5'`).

## Structure that works

| Part   | Lines | Job                                            |
| ------ | ----- | ---------------------------------------------- |
| Hook   | 1     | Question, surprising number or visible problem |
| Stakes | 1–2   | Why it matters to the viewer                   |
| Core   | 3–7   | The explanation, one step or fact per line     |
| Twist  | 0–2   | The trap, the common mistake or the "but"      |
| Payoff | 1     | The one sentence to remember                   |
| CTA    | 1     | One action, ideally a comment keyword          |

## Good and bad

Good: a hook, one idea per line, concrete nouns to anchor visuals on.

```yaml
script:
  - text: 'Why does a container wait five days at the port?'
  - text: 'Every extra day adds storage fees.'
  - text: 'Most delays come from missing documents.'
  - text: 'Send them before arrival, and it drops to two days.'
  - text: 'Comment SLOTS for part two.'
```

Bad: a slow opener, several ideas per line, too fast to read, no CTA.

```yaml
script:
  - text: 'Hi everyone, welcome back to the channel, today we are going to talk about ports.'
  - text: 'Ports have cranes, customs, trucks, storage yards and documents, and all of them can cause delays depending on many factors.'
```

## Checklist

- [ ] Line 1 is a hook a stranger would stop for; speaking starts within 3 s.
- [ ] Every line holds one idea and 4–12 words; none exceeds 3.5 words/s.
- [ ] Each visual has a word that names it in its line.
- [ ] Captions fit 2 lines of 34 characters (no V-10 warnings).
- [ ] Arabic: technical terms kept in English inside the sentence (`الـ client`).
- [ ] Last line is a single, clear call to action.
- [ ] No real brands, no medical, legal or financial advice (see `reelforge-industry-playbooks`).

References: [arabic](references/arabic.md) (MSA vs dialect, mixed terms) and
[hooks-and-ctas](references/hooks-and-ctas.md) (patterns and examples).
