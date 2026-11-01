# Contributing

Contributions are welcome under the Apache License 2.0 (documentation and examples under CC BY 4.0).
[`CONTRIBUTING.md`](../../CONTRIBUTING.md) in the repository covers the development setup on Windows, macOS
and Linux, commit conventions and the quality gate every pull request must pass:

```bash
pnpm build && pnpm typecheck && pnpm lint && pnpm test:unit && pnpm test:browser
```

This page describes the four most common contributions.

## Add a component

1. Add its prop schema and defaults in `packages/core/src/components/`. Props are strict Zod objects; give
   every prop a sensible default so the editor can insert the component with no input.
2. Add its runtime in `packages/runtime/src/components/`. It draws DOM/SVG for any time `t` and must stay
   pure: no `Date.now()`, no unseeded randomness, no timers. Support right-to-left layout.
3. Add a scene that shows it to the gallery in `fixtures/golden/components/episode.yaml`.
4. Refresh the golden frames and review every changed image:
   `UPDATE_GOLDEN=1 pnpm test:browser` (PowerShell:
   `$env:UPDATE_GOLDEN=1; pnpm test:browser; Remove-Item Env:UPDATE_GOLDEN`).
5. Regenerate the documentation with `pnpm docs:gen`. The [components reference](../reference/components.md)
   picks up the schema and the new gallery frame.

The `reelforge-contribute-component` skill has a detailed checklist.

## Add a theme

Copy `themes/default.theme.yaml` to `themes/<name>.theme.yaml` and change the tokens, or generate one with
`pnpm reelforge theme new <name> --accent "#hex"`. Use only bundled fonts and keep the contrast rules in
[Themes and branding](themes.md): the theme test checks WCAG AA for every bundled theme. Check it with an
example episode (`meta.theme: <name>`) and `reelforge snap`. Themes contain no code.

## Add an industry pack

A pack lives in `packs/<id>/`:

```text
packs/<id>/
  pack.yaml                     manifest: names, description, theme, blueprints, templates and slots
  templates/<template>.en.yaml  an episode with {{slot}} placeholders (one file per language)
  templates/<template>.ar.yaml
  examples/<name>-en/           a complete example episode (generated)
  examples/<name>-ar/
```

1. Open an [industry pack request](https://github.com/TerminalDZ/vidcreat/issues/new?template=industry_pack_request.yml)
   first so the scope can be agreed.
2. Write `pack.yaml`; it is validated by the pack schema in `packages/core/src/packs.ts` when loaded. Use
   fictional organization names only, and keep slot limits tight enough that text fits its box.
3. Write each template in English and Arabic. Every element should enter on a word of the script.
4. Add the example to `scripts/gen-pack-examples.mjs` and run it; then validate the examples and render them
   with `--silent`.
5. Add a playbook in `skills/reelforge-industry-playbooks/references/<id>.md` (audience, tone, typical
   episodes, compliance), and run `pnpm docs:gen` to update the [pack catalog](../reference/packs.md).

## Add a skill

Skills live in `skills/<name>/SKILL.md` in the Agent Skills format: YAML front matter with a `name` and a
one-sentence `description` of when to use the skill, followed by concise Markdown instructions; longer
material goes in `references/`. Keep each skill focused on one task, refer only to commands and files that
exist, and test it by following the instructions yourself on a fresh episode. `pnpm check:skills` (part of
`pnpm lint`) checks the format, and `get_guide` serves the new skill automatically.

## Documentation

The site and the offline documentation are built from the same Markdown in `docs/`:

| Command           | What it does                                                                                                     |
| ----------------- | ---------------------------------------------------------------------------------------------------------------- |
| `pnpm docs:gen`   | Regenerates the reference pages, component frames, `docs/components.md`, `llms-full.txt`                         |
| `pnpm docs:dev`   | Serves the site locally with live reload                                                                         |
| `pnpm docs:site`  | Builds the public site (base `/vidcreat/`) into `docs/.site` (fails on dead links)                               |
| `pnpm docs:local` | Builds the same site with base `/docs/` into `documentation/site`, which the dashboard serves at `/docs/`        |
| `pnpm docs:build` | Runs `docs:gen`, the single-file `documentation/index.html` (English and Arabic) and `docs:local`; commit result |

English pages live in `docs/guide/` and `docs/reference/`; their Arabic versions mirror them under
`docs/ar/`. Never edit generated pages by hand: CI runs `node scripts/check-docs-fresh.mjs` and fails when
they are out of date. In Arabic pages, keep technical terms, commands and YAML keys in English inside
backticks, and avoid starting a paragraph with a Latin word.

## Decision records

For a significant design change, add an ADR in `docs/adr/` (next number, context, decision, consequences).
