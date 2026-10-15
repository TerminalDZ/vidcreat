# Component reference

Generated from the schemas in `packages/core/src/components/schemas.ts` by
`node scripts/gen-components-doc.mjs`. Props are strict: unknown keys are errors with a
"did you mean" hint.

Conventions:

- Keys named `at` and `until` (at any depth), and `strike`/`highlight` when not booleans, are
  **time expressions**: `12.5s`, `l7`, `l7+0.4`, `l7.end`, `l7:'word'`, `l7:'word'#2`, `l7.3`, `@scene.end`.
- Keys named `color`, `accent`, `danger` and `colors[]` take a **theme color name**
  (`lime`, `cyan`, `red`, `amber`, `violet`, `ink`, `dim`, …) or a CSS color.
- `from`/`to` endpoints are an element id (`api`), an element side (`api.left|right|top|bottom|center`)
  or a point `{x, y}` in stage coordinates.
- Every element also takes the common keys: `id, place, size, col, layer, z, enter, exit, states, fx, sfx`
  (see [authoring.md](authoring.md)).

| Component                 | Default size | Default enter | Layer   | Purpose                                                                    |
| ------------------------- | ------------ | ------------- | ------- | -------------------------------------------------------------------------- |
| [`title`](#title)         | 960×240      | rise          | base    | Big display text; **accent** markup colors words with the accent color.    |
| [`label`](#label)         | 640×60       | fade          | base    | Small uppercase monospace label.                                           |
| [`code`](#code)           | 960×520      | rise          | base    | Code card with token colors that types itself.                             |
| [`node`](#node)           | 300×170      | pop           | base    | Box with a title and a sub-status; status changes its color.               |
| [`arrow`](#arrow)         | 200×40       | draw          | overlay | Straight, elbow or curved arrow with an optional label and moving packets. |
| [`chip`](#chip)           | 340×84       | pop           | base    | Pill/tag, optionally struck through.                                       |
| [`stamp`](#stamp)         | 680×260      | stamp         | overlay | Rotated bordered word that slams in (×2, DEADLOCK).                        |
| [`table`](#table)         | 960×440      | pop           | base    | Header + rows with animated row inserts and highlights.                    |
| [`lanes`](#lanes)         | 960×760      | pop           | base    | Parallel columns of timed steps (race conditions).                         |
| [`checklist`](#checklist) | 880×460      | pop           | base    | Items with check boxes appearing in sequence.                              |
| [`counter`](#counter)     | 820×320      | pop           | base    | Big number counting between keyframe values.                               |
| [`meter`](#meter)         | 880×180      | pop           | base    | Horizontal bar with an optional threshold marker.                          |
| [`timeline`](#timeline)   | 960×260      | pop           | base    | Axis with markers at relative positions (backoff, TTL).                    |
| [`grid`](#grid)           | 640×640      | pop           | base    | N×M tiles with per-tile states (thread pool, shards, services).            |
| [`bucket`](#bucket)       | 440×560      | pop           | base    | Token bucket whose tokens are consumed and refilled over time.             |
| [`phone`](#phone)         | 440×880      | pop           | base    | Phone mock with a checkout screen, button taps and notifications.          |
| [`quote`](#quote)         | 940×460      | rise          | base    | Quote card with author; the quote types itself.                            |
| [`particles`](#particles) | 1080×1000    | none          | overlay | Seeded particle bursts, herds, streams, dust or confetti.                  |
| [`trap`](#trap)           | 1080×1000    | glitch        | overlay | The series "THE TRAP" interstitial with warning tapes.                     |
| [`cta`](#cta)             | 960×560      | rise          | base    | "Next episode" title plus a comment box typing a keyword.                  |
| [`icon`](#icon)           | 160×160      | pop           | base    | Inline SVG icon from the bundled set, or an SVG from assets/.              |

## title

Big display text; **accent** markup colors words with the accent color.

| Prop     | Type                                      | Default    | Required |
| -------- | ----------------------------------------- | ---------- | -------- |
| `text`   | string                                    |            | yes      |
| `size`   | number                                    |            |          |
| `align`  | `left` \| `center` \| `right`             | `"center"` |          |
| `color`  | string                                    | `"ink"`    |          |
| `accent` | string                                    | `"lime"`   |          |
| `font`   | `auto` \| `display` \| `arabic` \| `mono` | `"auto"`   |          |
| `weight` | integer                                   | `800`      |          |
| `sub`    | string                                    |            |          |

## label

Small uppercase monospace label.

| Prop    | Type                          | Default  | Required |
| ------- | ----------------------------- | -------- | -------- |
| `text`  | string                        |          | yes      |
| `color` | string                        | `"dim"`  |          |
| `size`  | number                        |          |          |
| `align` | `left` \| `center` \| `right` | `"left"` |          |
| `dot`   | boolean                       | `false`  |          |

## code

Code card with token colors that types itself.

| Prop        | Type                                   | Default | Required |
| ----------- | -------------------------------------- | ------- | -------- |
| `title`     | string                                 |         |          |
| `lang`      | string                                 | `"ts"`  |          |
| `lines`     | (string \| { text, color, at, dim })[] |         | yes      |
| `fontSize`  | number                                 | `30`    |          |
| `cps`       | number                                 | `28`    |          |
| `caret`     | boolean                                | `true`  |          |
| `numbers`   | boolean                                | `true`  |          |
| `typing`    | boolean                                | `true`  |          |
| `highlight` | { line, at, until, color }[]           | `[]`    |          |

## node

Box with a title and a sub-status; status changes its color.

| Prop     | Type                                                                                                                                                                                                                                                                                                                         | Default  | Required |
| -------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------- | -------- |
| `title`  | string                                                                                                                                                                                                                                                                                                                       |          | yes      |
| `sub`    | string                                                                                                                                                                                                                                                                                                                       |          |          |
| `color`  | string                                                                                                                                                                                                                                                                                                                       | `"cyan"` |          |
| `status` | `idle` \| `ok` \| `err` \| `warn` \| `busy` \| `off`                                                                                                                                                                                                                                                                         | `"idle"` |          |
| `icon`   | `lock` \| `unlock` \| `bell` \| `clock` \| `warn` \| `bubble` \| `bomb` \| `check` \| `x` \| `server` \| `db` \| `user` \| `users` \| `bolt` \| `card` \| `wifi` \| `wifi-off` \| `cloud` \| `key` \| `mail` \| `cart` \| `cpu` \| `queue` \| `shield` \| `fire` \| `refresh` \| `hourglass` \| `phone` \| `code` \| `globe` |          |          |
| `badge`  | string                                                                                                                                                                                                                                                                                                                       |          |          |

## arrow

Straight, elbow or curved arrow with an optional label and moving packets.

| Prop      | Type                                          | Default      | Required |
| --------- | --------------------------------------------- | ------------ | -------- |
| `from`    | string \| { x, y }                            |              | yes      |
| `to`      | string \| { x, y }                            |              | yes      |
| `label`   | string                                        |              |          |
| `color`   | string                                        | `"dim"`      |          |
| `dashed`  | boolean                                       | `false`      |          |
| `route`   | `straight` \| `elbow` \| `curve`              | `"straight"` |          |
| `width`   | number                                        | `5`          |          |
| `head`    | `end` \| `start` \| `both` \| `none`          | `"end"`      |          |
| `packet`  | boolean \| { at, dur, color, reverse, label } | `false`      |          |
| `packets` | { at, dur, color, reverse, label }[]          | `[]`         |          |
| `gap`     | number                                        | `14`         |          |

## chip

Pill/tag, optionally struck through.

| Prop      | Type                                                                                                                                                                                                                                                                                                                         | Default  | Required |
| --------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------- | -------- |
| `text`    | string                                                                                                                                                                                                                                                                                                                       |          | yes      |
| `color`   | string                                                                                                                                                                                                                                                                                                                       | `"lime"` |          |
| `strike`  | boolean \| string \| number                                                                                                                                                                                                                                                                                                  | `false`  |          |
| `icon`    | `lock` \| `unlock` \| `bell` \| `clock` \| `warn` \| `bubble` \| `bomb` \| `check` \| `x` \| `server` \| `db` \| `user` \| `users` \| `bolt` \| `card` \| `wifi` \| `wifi-off` \| `cloud` \| `key` \| `mail` \| `cart` \| `cpu` \| `queue` \| `shield` \| `fire` \| `refresh` \| `hourglass` \| `phone` \| `code` \| `globe` |          |          |
| `variant` | `solid` \| `outline` \| `soft`                                                                                                                                                                                                                                                                                               | `"soft"` |          |
| `size`    | number                                                                                                                                                                                                                                                                                                                       | `34`     |          |

## stamp

Rotated bordered word that slams in (×2, DEADLOCK).

| Prop    | Type   | Default | Required |
| ------- | ------ | ------- | -------- |
| `text`  | string |         | yes      |
| `color` | string | `"red"` |          |
| `size`  | number | `120`   |          |
| `rot`   | number | `-5`    |          |

## table

Header + rows with animated row inserts and highlights.

| Prop       | Type                                      | Default  | Required |
| ---------- | ----------------------------------------- | -------- | -------- |
| `columns`  | string[]                                  |          | yes      |
| `rows`     | { cells, at, highlight, color, strike }[] | `[]`     |          |
| `widths`   | number[]                                  |          |          |
| `fontSize` | number                                    | `28`     |          |
| `accent`   | string                                    | `"lime"` |          |

## lanes

Parallel columns of timed steps (race conditions).

| Prop         | Type                      | Default | Required |
| ------------ | ------------------------- | ------- | -------- |
| `lanes`      | { title, color, steps }[] |         | yes      |
| `interleave` | boolean                   | `true`  |          |
| `fontSize`   | number                    | `26`    |          |

## checklist

Items with check boxes appearing in sequence.

| Prop       | Type               | Default  | Required |
| ---------- | ------------------ | -------- | -------- |
| `title`    | string             |          |          |
| `items`    | { text, at, ok }[] |          | yes      |
| `fontSize` | number             | `36`     |          |
| `color`    | string             | `"lime"` |          |

## counter

Big number counting between keyframe values.

| Prop        | Type                 | Default | Required |
| ----------- | -------------------- | ------- | -------- |
| `keyframes` | { at, value, dur }[] |         | yes      |
| `from`      | number               | `0`     |          |
| `prefix`    | string               | `""`    |          |
| `suffix`    | string               | `""`    |          |
| `decimals`  | integer              | `0`     |          |
| `separator` | boolean              | `true`  |          |
| `label`     | string               |         |          |
| `color`     | string               | `"ink"` |          |
| `size`      | number               | `180`   |          |

## meter

Horizontal bar with an optional threshold marker.

| Prop        | Type                 | Default  | Required |
| ----------- | -------------------- | -------- | -------- |
| `keyframes` | { at, value, dur }[] |          | yes      |
| `from`      | number               | `0`      |          |
| `max`       | number               | `100`    |          |
| `threshold` | number               |          |          |
| `label`     | string               |          |          |
| `unit`      | string               | `""`     |          |
| `color`     | string               | `"lime"` |          |
| `danger`    | string               | `"red"`  |          |

## timeline

Axis with markers at relative positions (backoff, TTL).

| Prop      | Type                             | Default  | Required |
| --------- | -------------------------------- | -------- | -------- |
| `markers` | { pos, label, sub, at, color }[] | `[]`     |          |
| `start`   | string                           |          |          |
| `end`     | string                           |          |          |
| `color`   | string                           | `"cyan"` |          |
| `cursor`  | { at, pos, dur }[]               | `[]`     |          |

## grid

N×M tiles with per-tile states (thread pool, shards, services).

| Prop    | Type                           | Default | Required |
| ------- | ------------------------------ | ------- | -------- |
| `cols`  | integer                        |         | yes      |
| `rows`  | integer                        |         | yes      |
| `tiles` | (string \| { label, state })[] | `[]`    |          |
| `steps` | { at, set }[]                  | `[]`    |          |
| `gap`   | number                         | `14`    |          |
| `label` | string                         |         |          |

## bucket

Token bucket whose tokens are consumed and refilled over time.

| Prop        | Type             | Default  | Required |
| ----------- | ---------------- | -------- | -------- |
| `capacity`  | integer          |          | yes      |
| `keyframes` | { at, tokens }[] | `[]`     |          |
| `label`     | string           |          |          |
| `rate`      | string           |          |          |
| `color`     | string           | `"lime"` |          |

## phone

Phone mock with a checkout screen, button taps and notifications.

| Prop            | Type                               | Default      | Required |
| --------------- | ---------------------------------- | ------------ | -------- |
| `title`         | string                             | `"Checkout"` |          |
| `amount`        | string                             |              |          |
| `item`          | string                             |              |          |
| `button`        | string                             | `"Pay now"`  |          |
| `notifications` | { title, text, at, color, icon }[] | `[]`         |          |
| `taps`          | { at }[]                           | `[]`         |          |
| `offline`       | boolean                            | `false`      |          |
| `loading`       | boolean                            | `false`      |          |
| `success`       | boolean \| string                  | `false`      |          |

## quote

Quote card with author; the quote types itself.

| Prop        | Type     | Default  | Required |
| ----------- | -------- | -------- | -------- |
| `text`      | string   |          | yes      |
| `author`    | string   |          |          |
| `highlight` | string[] | `[]`     |          |
| `cps`       | number   | `32`     |          |
| `color`     | string   | `"lime"` |          |
| `size`      | number   | `56`     |          |

## particles

Seeded particle bursts, herds, streams, dust or confetti.

| Prop     | Type                                                  | Default   | Required |
| -------- | ----------------------------------------------------- | --------- | -------- |
| `kind`   | `burst` \| `herd` \| `stream` \| `dust` \| `confetti` | `"burst"` |          |
| `from`   | string \| { x, y }                                    |           |          |
| `to`     | string \| { x, y }                                    |           |          |
| `count`  | integer                                               | `40`      |          |
| `at`     | time                                                  |           |          |
| `dur`    | number                                                | `1.2`     |          |
| `color`  | string                                                | `"lime"`  |          |
| `colors` | string[]                                              |           |          |
| `size`   | number                                                | `10`      |          |
| `spread` | number                                                | `140`     |          |
| `seed`   | integer                                               | `1`       |          |

## trap

The series "THE TRAP" interstitial with warning tapes.

| Prop    | Type   | Default      | Required |
| ------- | ------ | ------------ | -------- |
| `title` | string | `"THE TRAP"` |          |
| `sub`   | string |              |          |
| `at`    | time   |              |          |
| `until` | time   |              |          |
| `color` | string | `"amber"`    |          |

## cta

"Next episode" title plus a comment box typing a keyword.

| Prop      | Type   | Default          | Required |
| --------- | ------ | ---------------- | -------- |
| `label`   | string | `"NEXT EPISODE"` |          |
| `next`    | string |                  | yes      |
| `keyword` | string |                  |          |
| `prompt`  | string | `"Comment"`      |          |
| `at`      | time   |                  |          |
| `color`   | string | `"lime"`         |          |

## icon

Inline SVG icon from the bundled set, or an SVG from assets/.

| Prop    | Type                                                                                                                                                                                                                                                                                                                         | Default | Required |
| ------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------- | -------- |
| `name`  | `lock` \| `unlock` \| `bell` \| `clock` \| `warn` \| `bubble` \| `bomb` \| `check` \| `x` \| `server` \| `db` \| `user` \| `users` \| `bolt` \| `card` \| `wifi` \| `wifi-off` \| `cloud` \| `key` \| `mail` \| `cart` \| `cpu` \| `queue` \| `shield` \| `fire` \| `refresh` \| `hourglass` \| `phone` \| `code` \| `globe` |         |          |
| `src`   | string                                                                                                                                                                                                                                                                                                                       |         |          |
| `size`  | number                                                                                                                                                                                                                                                                                                                       | `140`   |          |
| `color` | string                                                                                                                                                                                                                                                                                                                       | `"ink"` |          |
| `pulse` | boolean                                                                                                                                                                                                                                                                                                                      | `false` |          |
| `ring`  | boolean                                                                                                                                                                                                                                                                                                                      | `false` |          |
