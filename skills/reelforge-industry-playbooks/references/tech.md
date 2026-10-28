# Tech and software

**Audience:** developers, students, technical founders, curious users.
**Tone:** sharp, concrete, a little playful; English terms kept in Arabic (`الـ server`, `الـ cache`).
**Theme:** `default` (dark, lime accent, grain and grid); `minimal` for corporate engineering
content.

## Typical episodes

| Episode                                    | Blueprint                | Components                                       |
| ------------------------------------------ | ------------------------ | ------------------------------------------------ |
| A system design concept (rate limiting, …) | `hook` + `process-steps` | `node` + `arrow` with packets, `bucket`, `lanes` |
| A bug and its fix                          | `problem-solution`       | `code` with `highlight`, `trap`, `stamp`         |
| Latency or cost numbers                    | `stat-reveal`            | `counter`, `bar-chart`, `meter`                  |
| Tool A vs tool B (generic)                 | `comparison`             | `comparison`, `table`                            |
| Release timeline                           | `timeline`               | `timeline`                                       |
| A request's path through the stack         | `map-route`              | `flow`, `node` + `arrow`                         |

## Compliance

- No real company, product or library logos; describe generic technologies ("a relational
  database", "a message queue"). Open standards and protocol names (HTTP, SQL, TCP) are fine.
- Code must be correct and runnable as shown; keep it ≤ 8 lines per `code` element.
- Security topics: explain defenses, not working exploits; no real credentials, keys or hosts
  (use `example.com`).
- Benchmarks only from the person; otherwise "example numbers".

## Example

```yaml
script:
  - text: 'Your API just got flooded with requests.'
  - text: 'A rate limiter decides who gets through.'
  - text: 'Each user gets a bucket of tokens.'
  - text: 'Every request takes one token.'
  - text: 'Empty bucket? The request waits, or gets a 429.'
  - text: 'Comment QUEUE for the next episode.'
```

Fictional names: Lattice Labs, Bytehaven, Bluefin Cloud.
