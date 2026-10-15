/** Template for `reelforge new <id>` (FR-CLI-1). */
export function episodeTemplate(
  id: string,
  opts: { series?: string; episode?: number; lang?: 'en' | 'ar' } = {},
): string {
  const series = opts.series ?? 'SYSTEM DESIGN';
  const ar = opts.lang === 'ar';
  const t = ar
    ? {
        lang: 'ar-EG',
        cover: 'عنوان الغلاف',
        caption: 'وصف الحلقة هنا.',
        tags: '["#systemdesign", "#برمجة"]',
        pinned: 'اكتب سؤالك في الكومنتات',
        lines: [
          'عمرك دفعت حاجة أونلاين، والنت فصل؟',
          'المشكلة دي اسمها Duplicate Charge',
          'والحل اسمه الـ Idempotency key',
        ],
      }
    : {
        lang: 'en-US',
        cover: 'Charged twice?',
        caption: 'Describe the episode here.',
        tags: '["#systemdesign", "#programming"]',
        pinned: 'Ask your question in the comments',
        lines: [
          'Ever paid online and your connection dropped?',
          'That problem is called a Duplicate Charge.',
          'The fix is an Idempotency key.',
        ],
      };
  return `# yaml-language-server: $schema=../../schema/episode.schema.json
# ReelForge episode spec. Docs: docs/authoring.md · components: docs/components.md
# Workflow: write the script → record voice.wav → \`reelforge cue ${id}\` → design scenes in
#           \`reelforge edit ${id}\` (or here) → \`reelforge validate ${id}\` → \`reelforge render ${id}\`

meta:
  id: ${id}
  series: "${series}"
  title: "My topic"
  episode: ${opts.episode ?? 1}
  preset: tiktok          # tiktok | reels | shorts
  theme: default          # themes/<name>.theme.yaml
  lang: ${t.lang}           # en-US, ar-EG, … (sets the caption direction)
  publish:
    cover: "${t.cover}"
    caption: |
      ${t.caption}
    hashtags: ${t.tags}
    pinned: "${t.pinned}"

audio:
  voice: voice.wav
  sfx: auto               # auto | none | manual
  sfx_gain_db: -16

# One entry per spoken sentence. Ids default to l1, l2, …
script:
${t.lines.map((l) => `  - text: "${l}"`).join('\n')}

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
        # pop rise reveal spring drop blur wipe slide-l slide-r fade type zoom flip stamp …
        # ease: smooth | snappy | gentle | linear
        enter: { at: "l2:'Duplicate'", anim: reveal }

  - id: fix
    at: l3
    glow: lime
    transition: push        # crossfade | cut | slide-up | zoom | push | blur
    camera: push-in         # still | drift | push-in | pull-out
    elements:
      - use: chip
        id: key
        props: { text: "Idempotency-Key", color: lime }
        place: { center: true, w: 520, h: 96 }
        enter: { at: "l3:'Idempotency'", anim: pop }
`;
}
