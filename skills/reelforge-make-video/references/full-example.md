# A complete episode

A 30-second explainer for a fictional port. With draft cues it validates with 0 errors; the only warning is the missing `voice.wav` (V-4). It shows the
patterns the other guides describe: one idea per scene, word-anchored entrances, exits that clear
space, a varied rhythm of animations and a CTA ending.

```yaml
meta:
  id: azur01
  series: 'PORT BASICS'
  title: 'Container Dwell Time'
  episode: 1
  preset: tiktok
  theme: default
  lang: en-US
  publish:
    cover: 'Why 5 days at the port?'
    caption: 'Where container days really go, and the one habit that saves three of them.'
    hashtags: ['#logistics', '#shipping', '#supplychain']
    pinned: 'Comment SLOTS for part two: how truck slots work.'

audio: { voice: voice.wav, sfx: auto, sfx_gain_db: -16 }

script:
  - text: 'Why does a container wait five days at the port?'
  - text: 'At the Port of Azur, the average dwell time is five days.'
  - text: 'Every extra day adds storage fees and delays delivery.'
  - text: 'First, the ship unloads the container onto the quay.'
  - text: 'Then customs checks the documents.'
  - text: 'Finally, a truck slot is booked for pickup.'
  - text: 'Missing documents cause most delays, not the cranes.'
  - text: 'Send documents before arrival, and it drops to two days.'
  - text: 'Follow for part two: how truck slots work.'

chapters:
  - { at: l1, label: '01 · THE WAIT' }
  - { at: l4, label: '02 · THE STEPS' }
  - { at: l7, label: '03 · THE FIX' }

scenes:
  - id: hook
    at: l1
    glow: amber
    elements:
      - use: title
        id: hook_title
        props: { text: 'Five days at the **port**?', size: 110 }
        place: { x: 60, y: 160, w: 960, h: 320 }
        enter: { at: "l1:'container'", anim: reveal }
      - use: icon
        id: hook_clock
        props: { name: clock, color: amber, ring: true }
        place: { x: 460, y: 520, w: 160, h: 160 }
        enter: { at: "l1:'wait'", anim: pop }

  - id: stat
    at: l2
    transition: zoom
    elements:
      - use: label
        id: port_name
        props: { text: 'Port of Azur', dot: true }
        place: { x: 140, y: 40, w: 640, h: 60 }
        enter: { at: "l2:'Port'", anim: fade }
      - use: counter
        id: dwell
        props:
          from: 0
          keyframes: [{ at: "l2:'five'", value: 5, dur: 0.8 }]
          suffix: ' days'
          label: 'AVERAGE DWELL TIME'
        place: { x: 140, y: 120, w: 800, h: 320 }
        enter: { at: "l2:'average'", anim: pop }
      - use: chip
        id: fees
        props: { text: 'Storage fees', color: red, icon: warn }
        place: { x: 270, y: 560, w: 540, h: 90 }
        enter: { at: "l3:'fees'", anim: spring }

  - id: steps
    at: l4
    transition: push
    elements:
      - use: steps
        id: flow
        props:
          items:
            - { title: 'Unload', text: 'Ship to quay', at: "l4:'unloads'" }
            - { title: 'Customs', text: 'Documents checked', at: "l5:'customs'" }
            - { title: 'Pickup', text: 'Truck slot booked', at: "l6:'truck'" }
        place: { x: 160, y: 120, w: 760, h: 620 }
        enter: { at: "l4:'First'", anim: fade }

  - id: cause
    at: l7
    glow: red
    elements:
      - use: chip
        id: docs
        props: { text: 'Missing documents', color: red, size: 44 }
        place: { x: 190, y: 220, w: 700, h: 110 }
        enter: { at: "l7:'missing'", anim: pop }
        exit: { at: l8, anim: fade }
      - use: chip
        id: cranes
        props: { text: 'Cranes', color: dim, strike: "l7:'cranes'+0.4" }
        place: { x: 340, y: 420, w: 400, h: 90 }
        enter: { at: "l7:'cranes'", anim: pop }
        exit: { at: l8, anim: fade }
      - use: before-after
        id: fix
        props:
          before: { text: 'Documents on arrival: 5 days' }
          after: { text: 'Documents before arrival: 2 days' }
          at: "l8:'drops'"
        place: { x: 60, y: 160, w: 860, h: 520 }
        enter: { at: "l8:'Send'", anim: rise }

  - id: outro
    at: l9
    transition: slide-up
    elements:
      - use: cta
        id: next
        props: { next: 'How truck slots work', keyword: 'SLOTS' }
        place: { x: 60, y: 180, w: 860, h: 560 }
        enter: { at: "l9:'Follow'", anim: rise }
```

Before handing it over: `validate_episode`, then `preview_frames` at
`["l1:'container'+0.8", "l2:'five'+1", "l6:'truck'+0.8", "l8:'drops'+1.2", "l9+1.5"]`.
