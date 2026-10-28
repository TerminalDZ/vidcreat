# Component matrix

Default sizes are in stage pixels (w×h). `list_components` returns the live list and
`get_component_schema` the exact props; prefer them over this table when they differ.

## Text

| Component | Size    | Use for                                | Key props                            | Enter on              |
| --------- | ------- | -------------------------------------- | ------------------------------------ | --------------------- |
| `title`   | 960×240 | The headline of a scene                | `text` (`**accent**`), `size`, `sub` | the key term          |
| `label`   | 640×60  | Kicker above a hero, a source line     | `text`, `dot`                        | the subject           |
| `chip`    | 340×84  | Short tags, options, a struck-out myth | `text`, `color`, `icon`, `strike`    | the tag word          |
| `stamp`   | 680×260 | A verdict slammed on top (overlay)     | `text`, `color`, `rot`               | the verdict word      |
| `quote`   | 940×460 | A principle or a fictional testimonial | `text`, `author`, `highlight`        | the speaker or "said" |

## Numbers and data

| Component       | Size    | Use for                                | Key props                                |
| --------------- | ------- | -------------------------------------- | ---------------------------------------- |
| `counter`       | 820×320 | One big number counting to a value     | `keyframes`, `prefix`, `suffix`, `label` |
| `stat-card`     | 420×260 | KPI with a delta (up/down)             | `label`, `value`, `delta`, `good`        |
| `progress-ring` | 360×360 | A percentage                           | `value`, `max`, `label`                  |
| `meter`         | 880×180 | A level against a threshold            | `keyframes`, `max`, `threshold`, `unit`  |
| `bar-chart`     | 960×560 | 2–12 values side by side               | `bars`, `orient`, `focus`                |
| `line-chart`    | 960×560 | A trend over time                      | `series`, `labels`                       |
| `donut-chart`   | 960×520 | Shares of a whole                      | `segments`, `value`, `label`             |
| `ranking`       | 960×560 | Ordered list with values               | `items`, `order`                         |
| `table`         | 960×440 | Rows of facts, rows inserted over time | `columns`, `rows`                        |

## Processes and structure

| Component    | Size    | Use for                         | Key props                       |
| ------------ | ------- | ------------------------------- | ------------------------------- |
| `steps`      | 760×620 | 1–8 ordered steps               | `items` (`title`, `text`, `at`) |
| `flow`       | 960×300 | A pipeline of 2–6 stages        | `stages`, `token`               |
| `cycle`      | 760×760 | A loop that repeats             | `stages`, `active`              |
| `funnel`     | 760×620 | Narrowing stages with values    | `stages`, `rate`                |
| `pyramid`    | 760×620 | Levels from base to top         | `levels`                        |
| `lanes`      | 960×760 | Parallel actors and their steps | `lanes`                         |
| `checklist`  | 880×460 | Requirements, do's              | `items` (`text`, `at`, `ok`)    |
| `timeline`   | 960×260 | Dates, phases, durations        | `markers` (`pos` 0–1), `cursor` |
| `org-chart`  | 960×560 | Roles and reporting lines       | `people` (nested or `parent`)   |
| `tree`       | 960×560 | Any hierarchy                   | `nodes`, `orient`               |
| `matrix-2x2` | 760×760 | Two-axis positioning            | `x`, `y`, `quadrants`, `items`  |

## Comparisons

| Component      | Size    | Use for                                 | Key props                  |
| -------------- | ------- | --------------------------------------- | -------------------------- |
| `comparison`   | 960×560 | A vs B with attribute rows and a winner | `a`, `b`, `rows`, `winner` |
| `before-after` | 960×520 | A change, wiped from before to after    | `before`, `after`, `at`    |

## Diagrams and objects

| Component   | Size        | Use for                                    | Key props                            |
| ----------- | ----------- | ------------------------------------------ | ------------------------------------ |
| `node`      | 300×170     | A place, system, team or actor             | `title`, `sub`, `icon`, `status`     |
| `arrow`     | (endpoints) | Connections and routes, packets moving     | `from`, `to`, `route`, `packet`      |
| `grid`      | 640×640     | Many similar units (rooms, slots, servers) | `cols`, `rows`, `tiles`, `steps`     |
| `bucket`    | 440×560     | Capacity being used and refilled           | `capacity`, `keyframes`              |
| `phone`     | 440×880     | App screens, notifications, checkout       | `title`, `notifications`, `taps`     |
| `code`      | 960×520     | Code or config that types itself           | `lines`, `highlight`                 |
| `icon`      | 160×160     | A symbol beside a title or in a row        | `name` (30 bundled), `ring`, `pulse` |
| `particles` | full        | Atmosphere: bursts, confetti (background)  | `kind`, `count`, `seed`              |
| `trap`      | full        | "THE TRAP" interstitial before a mistake   | `title`, `sub`                       |
| `cta`       | 960×560     | The closing call to action                 | `next`, `keyword`                    |

Bundled icons: lock, unlock, bell, clock, warn, bubble, bomb, check, x, server, db, user, users,
bolt, card, wifi, wifi-off, cloud, key, mail, cart, cpu, queue, shield, fire, refresh, hourglass,
phone, code, globe.

## Places without a map

There is no geographic map component. Show places as `node` boxes (with `icon: globe` or a short
`sub` such as a region) connected by an `arrow` with a `packet` that travels on the spoken verb,
or as a `flow` of stops. The `map-route` blueprint builds this layout for you.

```yaml
elements:
  - use: node
    id: origin
    props: { title: 'Port of Azur', sub: 'Origin', icon: globe }
    place: { x: 80, y: 200, w: 340, h: 170 }
    enter: { at: "l3:'Azur'", anim: pop }
  - use: node
    id: dest
    props: { title: 'Inland hub', sub: 'Destination', icon: globe, color: lime }
    place: { x: 580, y: 520, w: 340, h: 170 }
    enter: { at: "l3:'hub'", anim: pop }
  - use: arrow
    id: route
    props: { from: origin.bottom, to: dest.top, route: elbow, packet: { at: "l4:'ships'", dur: 1.2 } }
    enter: { at: "l3:'hub'+0.3", anim: draw }
```
