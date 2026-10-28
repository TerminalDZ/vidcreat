# Arabic scripts

Set `meta.lang` to an Arabic locale (`ar-EG`, `ar-SA`, `ar-MA`, …). Captions switch to right-to-left
automatically and mixed English terms keep their direction; you do not add any markup.

## Keep technical terms in English

Viewers search and read the English term; translating it often makes the line harder to follow.
Attach Arabic articles and prepositions with a tatweel or a space as people write them:

```yaml
script:
  - text: 'الـ client يبعت request للـ server.'
  - text: 'الـ server يرجع response في أقل من ثانية.'
```

Word anchors match the term as written: `l1:'client'`, `l2:'response'`. Anchoring on the Arabic
article (`الـ`) does not work well; anchor on the term itself.

## MSA or dialect

| Choice                                        | Use it when                                                   | Example                                  |
| --------------------------------------------- | ------------------------------------------------------------- | ---------------------------------------- |
| Modern Standard Arabic (MSA)                  | Institutions, healthcare, government, finance, pan-Arab reach | `هل تعرف لماذا تنتظر الحاوية خمسة أيام؟` |
| Dialect (Egyptian, Gulf, Maghrebi, Levantine) | Casual education, food, retail, creators                      | `عمرك سألت ليه الحاوية بتستنى خمس أيام؟` |

- Pick one register per episode and keep it; mixing MSA sentences with dialect reads as an error.
- Match the person's own voice: they record the script, so write what they would say.
- Dialect speeds speech up. Keep lines short; V-14 counts words, and Arabic words carry more
  meaning each, so aim for 2.0 words/s.

## Captions

- The 34-character caption limit applies to Arabic too. Arabic words are longer on average:
  prefer 4–8 words per line.
- Numbers: write Western digits (`5`) or words consistently. Word anchors such as `l2:'5'` match
  digits as written.
- Avoid diacritics except to disambiguate; anchors ignore them anyway.

## CTA in Arabic

Use a comment keyword in English when the next episode's topic is an English term:
`اكتب race في الكومنتات عشان الحلقة الجاية`. The `cta` component's `keyword` prop types it on screen.
