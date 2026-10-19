/** Starter props for new elements: valid and good-looking out of the box. */
export function starterProps(component: string, at: string): Record<string, unknown> {
  switch (component) {
    case 'title':
      return { text: 'Your **headline** here' };
    case 'label':
      return { text: 'LABEL', dot: true, color: 'cyan' };
    case 'code':
      return { title: 'example.ts', lines: ['const total = items.length;', 'console.log(total);'] };
    case 'node':
      return { title: 'Server', sub: 'ready', icon: 'server', status: 'ok' };
    case 'arrow':
      return { from: { x: 240, y: 300 }, to: { x: 840, y: 300 }, label: 'request' };
    case 'chip':
      return { text: 'New chip', icon: 'bolt' };
    case 'stamp':
      return { text: 'DONE', color: 'lime' };
    case 'table':
      return {
        columns: ['id', 'name', 'status'],
        rows: [{ cells: ['1', 'Alice', 'active'] }, { cells: ['2', 'Bob', 'idle'] }],
      };
    case 'lanes':
      return {
        lanes: [
          { title: 'Request A', color: 'cyan', steps: [{ text: 'read → 100', at }] },
          { title: 'Request B', color: 'violet', steps: [{ text: 'read → 100', at }] },
        ],
      };
    case 'checklist':
      return {
        title: 'Checklist',
        items: [{ text: 'First point' }, { text: 'Second point' }, { text: 'Third point' }],
      };
    case 'counter':
      return { from: 0, keyframes: [{ at, value: 100, dur: 1 }], label: 'requests / s' };
    case 'meter':
      return { keyframes: [{ at, value: 72, dur: 1 }], label: 'CPU', unit: '%', threshold: 80 };
    case 'grid':
      return { cols: 3, rows: 3 };
    case 'bucket':
      return { capacity: 10, label: 'tokens' };
    case 'quote':
      return { text: 'Simplicity is a prerequisite for reliability.', author: 'Edsger W. Dijkstra' };
    case 'particles':
      return { kind: 'confetti', count: 60 };
    case 'cta':
      return { next: 'Next episode', keyword: 'next' };
    case 'icon':
      return { name: 'bolt', size: 120, color: 'lime' };
    case 'bar-chart':
      return {
        bars: [
          { label: 'Mon', value: 40 },
          { label: 'Tue', value: 65 },
          { label: 'Wed', value: 52 },
          { label: 'Thu', value: 80 },
        ],
      };
    case 'line-chart':
      return { labels: ['Q1', 'Q2', 'Q3', 'Q4'], series: [{ label: 'Revenue', values: [12, 18, 15, 26] }] };
    case 'donut-chart':
      return {
        label: 'traffic',
        segments: [
          { label: 'Mobile', value: 58 },
          { label: 'Desktop', value: 34 },
          { label: 'Tablet', value: 8 },
        ],
      };
    case 'stat-card':
      return { label: 'Active users', value: 12400, delta: 8 };
    case 'progress-ring':
      return { value: 75, label: 'done' };
    case 'comparison':
      return {
        a: { title: 'Option A' },
        b: { title: 'Option B' },
        rows: [
          { label: 'Fast', a: true, b: false },
          { label: 'Cheap', a: false, b: true },
        ],
      };
    case 'before-after':
      return { before: { text: 'Slow and manual' }, after: { text: 'Fast and automatic' } };
    case 'ranking':
      return {
        items: [
          { label: 'First', value: 90 },
          { label: 'Second', value: 70 },
          { label: 'Third', value: 45 },
        ],
      };
    case 'steps':
      return { items: [{ title: 'Plan' }, { title: 'Build' }, { title: 'Ship' }] };
    case 'flow':
      return { stages: [{ label: 'Input' }, { label: 'Process' }, { label: 'Output' }] };
    case 'org-chart':
      return {
        people: [
          { id: 'lead', name: 'Lead', role: 'Manager' },
          { parent: 'lead', name: 'Ana', role: 'Engineer' },
          { parent: 'lead', name: 'Ben', role: 'Designer' },
        ],
      };
    case 'tree':
      return { nodes: [{ label: 'Root', children: [{ label: 'Left' }, { label: 'Right' }] }] };
    case 'cycle':
      return { stages: [{ label: 'Plan' }, { label: 'Do' }, { label: 'Check' }, { label: 'Act' }] };
    case 'funnel':
      return {
        stages: [
          { label: 'Visitors', value: 1000 },
          { label: 'Sign-ups', value: 300 },
          { label: 'Customers', value: 80 },
        ],
      };
    case 'pyramid':
      return { levels: [{ label: 'Top' }, { label: 'Middle' }, { label: 'Base' }] };
    case 'matrix-2x2':
      return {
        x: { label: 'Effort' },
        y: { label: 'Impact' },
        quadrants: [
          { title: 'Quick wins' },
          { title: 'Big bets' },
          { title: 'Fill-ins' },
          { title: 'Avoid' },
        ],
        items: [{ label: 'Idea', x: 0.3, y: 0.7 }],
      };
    case 'map':
      return {
        pins: [
          { id: 'a', label: 'Cairo', lon: 31.2, lat: 30 },
          { id: 'b', label: 'Rotterdam', lon: 4.5, lat: 51.9 },
        ],
        routes: [{ from: 'a', to: 'b', vehicle: 'plane', at }],
      };
    case 'route':
      return { vehicle: 'truck', stops: [{ label: 'Warehouse' }, { label: 'Hub' }, { label: 'Store' }] };
    case 'floor-plan':
      return {
        cols: 10,
        rows: 6,
        rooms: [
          { id: 'living', label: 'Living room', x: 0, y: 0, w: 6, h: 6, icon: 'sofa' },
          { label: 'Kitchen', x: 6, y: 0, w: 4, h: 3, icon: 'utensils' },
          { label: 'Bedroom', x: 6, y: 3, w: 4, h: 3, icon: 'bed' },
        ],
        highlights: [{ at, room: 'living' }],
      };
    case 'building':
      return {
        floors: [{ label: 'Lobby' }, { label: 'Offices' }, { label: 'Roof terrace' }],
        highlights: [{ at, floor: 1 }],
      };
    case 'container-stack':
      return {
        containers: [{ code: 'MSKU 204871 3' }, { code: 'CMAU 551902 0' }, { code: 'HLXU 318265 7' }],
      };
    case 'calendar':
      return { year: 2026, month: 11, days: [{ day: 12, at }] };
    case 'clock':
      return { time: '09:00', keyframes: [{ at, time: '17:00', dur: 2 }] };
    case 'schedule-board':
      return {
        rows: [
          { cells: ['08:15', 'DUBAI', 'A12', 'ON TIME'] },
          { cells: ['08:40', 'LONDON', 'B03', 'ON TIME'] },
        ],
      };
    case 'appointment':
      return { title: 'Check-up', date: 'Tue 17 Nov', time: '10:30', place: 'City Clinic' };
    case 'person-card':
      return { name: 'Amina Haddad', role: 'Cardiologist' };
    case 'chat':
      return { messages: [{ text: 'Is my order ready?', from: 'me' }, { text: 'Yes, pick it up today.' }] };
    case 'notification':
      return { items: [{ title: 'Order shipped', text: 'Arrives Thursday', icon: 'truck' }] };
    case 'speech-bubble':
      return { text: 'Hello there!' };
    case 'lower-third':
      return { name: 'Your Name', title: 'Your role' };
    case 'image':
      return { src: 'assets/photo.jpg' };
    case 'logo':
      return { text: 'Your**Brand**', icon: 'sparkles' };
    case 'kinetic-text':
      return { text: 'Say it **word** by word' };
    case 'bullet-list':
      return { items: ['First point', 'Second point', 'Third point'] };
    case 'callout':
      return { to: { x: 540, y: 400 }, text: 'Look here' };
    case 'spotlight':
      return { target: { x: 340, y: 300, w: 400, h: 300 }, label: 'This part' };
    case 'split-screen':
      return {
        a: { title: 'Before', text: 'The old way' },
        b: { title: 'After', text: 'The new way' },
        badge: 'VS',
      };
    case 'pricing-table':
      return {
        plans: [
          { name: 'Basic', price: 9, period: '/mo', features: ['1 user'] },
          { name: 'Pro', price: 29, period: '/mo', featured: true, features: ['5 users', 'Support'] },
        ],
      };
    case 'qr-code':
      return { text: 'https://example.com', label: 'Scan me' };
    case 'rating':
      return { value: 4.5, label: 'Example score' };
    case 'vitals':
      return { bpm: 72, keyframes: [{ at, value: 110, dur: 1.5 }] };
    default:
      return {};
  }
}
