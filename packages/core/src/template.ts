/** Template for `reelforge new <id>` (FR-CLI-1). */
export function episodeTemplate(id: string, opts: { series?: string; episode?: number } = {}): string {
  const series = opts.series ?? 'SYSTEM DESIGN';
  return `# yaml-language-server: $schema=../../schema/episode.schema.json
# ReelForge episode spec. Docs: docs/authoring.md · components: docs/components.md
# Workflow: write the script → record voice.wav → \`reelforge cue ${id}\` → describe scenes →
#           \`reelforge dev ${id}\` → \`reelforge validate ${id}\` → \`reelforge render ${id}\`

meta:
  id: ${id}
  series: "${series}"
  title: "My topic"
  episode: ${opts.episode ?? 1}
  preset: tiktok          # tiktok | reels | shorts
  theme: default          # themes/<name>.theme.yaml
  lang: ar-EG
  publish:
    cover: "عنوان الغلاف"
    caption: |
      وصف الحلقة هنا.
    hashtags: ["#systemdesign", "#برمجة"]
    pinned: "اكتب سؤالك في الكومنتات"

audio:
  voice: voice.wav
  sfx: auto               # auto | none | manual
  sfx_gain_db: -16

# One entry per spoken sentence. Ids default to l1, l2, …
script:
  - text: "عمرك دفعت حاجة أونلاين، والنت فصل؟"
  - text: "المشكلة دي اسمها Duplicate Charge"
  - text: "والحل اسمه الـ Idempotency key"

chapters:
  - { at: l1, label: "01 · THE PROBLEM" }
  - { at: l3, label: "02 · THE FIX" }

scenes:
  - id: hook
    at: l1
    glow: red
    elements:
      - use: title
        id: hook_title
        props: { text: "**Duplicate** Charge" }
        place: { x: 60, y: 380, w: 960, h: 240 }
        enter: { at: "l2:'Duplicate'", anim: pop }

  - id: fix
    at: l3
    glow: lime
    elements:
      - use: chip
        id: key
        props: { text: "Idempotency-Key", color: lime }
        place: { center: true, w: 520, h: 96 }
        enter: { at: "l3:'Idempotency'", anim: pop }
`;
}
