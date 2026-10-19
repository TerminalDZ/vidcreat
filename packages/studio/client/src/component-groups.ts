/** Component categories, shared by the editor's Insert panel and the dashboard gallery. */
export const GROUPS: [string, string[]][] = [
  ['Text', ['title', 'label', 'chip', 'stamp', 'quote']],
  ['Diagrams', ['node', 'arrow', 'lanes', 'grid', 'timeline', 'bucket']],
  ['Data', ['counter', 'meter', 'table', 'checklist', 'stat-card', 'comparison', 'before-after']],
  ['Charts', ['bar-chart', 'line-chart', 'donut-chart', 'progress-ring', 'ranking']],
  ['Process & structure', ['steps', 'flow', 'cycle', 'funnel', 'pyramid', 'matrix-2x2', 'org-chart', 'tree']],
  ['Places & movement', ['map', 'route', 'floor-plan', 'building', 'container-stack']],
  ['Time', ['calendar', 'clock', 'schedule-board', 'appointment']],
  ['People & messaging', ['person-card', 'chat', 'notification', 'speech-bubble', 'lower-third']],
  [
    'Media & text',
    [
      'image',
      'logo',
      'kinetic-text',
      'bullet-list',
      'callout',
      'spotlight',
      'split-screen',
      'pricing-table',
      'qr-code',
      'rating',
    ],
  ],
  ['Health & data', ['vitals']],
  ['Code & devices', ['code', 'phone', 'icon']],
  ['Effects & endings', ['particles', 'trap', 'cta']],
];
