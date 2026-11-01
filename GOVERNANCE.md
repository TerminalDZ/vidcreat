# Governance

ReelForge is a small project with a single maintainer and an open contribution process.

## Maintainer

- Idriss Boukmouche ([@TerminalDZ](https://github.com/TerminalDZ)), boukemoucheidriss@gmail.com

The maintainer sets the roadmap, reviews and merges pull requests, publishes releases and enforces the
[Code of Conduct](CODE_OF_CONDUCT.md).

## How decisions are made

- **Everyday changes** (bug fixes, documentation, new components, themes, packs and skills) are decided
  in the pull request. Anyone can propose; the maintainer reviews and merges.
- **Significant changes** (a new package boundary, a change to the episode format or the Timeline
  contract, a new dependency in the render path, anything that affects determinism or local server
  security) need an architecture decision record in [docs/adr](docs/adr). Open the ADR as a pull request
  with the status `proposed`; it is discussed there and merged as `accepted` or closed as `rejected`.
  Later decisions supersede earlier ADRs instead of rewriting them.
- **Disagreements** are discussed in the issue or pull request. When consensus is not reached, the
  maintainer decides and records the reasoning.

## Pull request review

Every pull request needs an approving review from the maintainer (see
[.github/CODEOWNERS](.github/CODEOWNERS)) and a green CI run before it is merged. See
[CONTRIBUTING.md](CONTRIBUTING.md) for the quality gate.

## Changes to this document

Governance changes are proposed as pull requests to this file. As the contributor base grows, the
project intends to add more maintainers with review and release rights.
