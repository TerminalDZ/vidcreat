## What and why

<!-- What does this change, and why is it needed? Link the issue: "Closes #123". -->

## How it was tested

<!-- Commands you ran, episodes you rendered, platforms you checked. -->

## Checklist

- [ ] The title follows [Conventional Commits](https://www.conventionalcommits.org/) (for example `fix(core): …`).
- [ ] `pnpm build && pnpm typecheck && pnpm lint && pnpm test:unit && pnpm test:browser` passes.
- [ ] Tests are added or updated, and no test was weakened to make it pass.
- [ ] Golden frames were refreshed only for intended visual changes, and I reviewed every changed image.
- [ ] Documentation is updated (`docs/`, `README.md`, `docs/components.md` regenerated if a schema changed).
- [ ] User-visible changes have an entry under `## [Unreleased]` in `CHANGELOG.md`.
- [ ] Significant design changes have an ADR in `docs/adr/`.
- [ ] New production dependencies pass `pnpm check:licenses`, and `THIRD-PARTY-NOTICES.md` is regenerated.
- [ ] Rendering stays deterministic, and local servers keep their security checks.
