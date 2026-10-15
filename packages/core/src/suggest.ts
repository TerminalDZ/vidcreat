/**
 * "Smart insert" without a model: keywords in a spoken line (English and Arabic, technical English
 * inside Arabic included) map to the components that usually illustrate them. Each suggestion comes
 * with props taken from the line and enters on the word that triggered it. Every suggestion is
 * validated against the component schema before it is returned.
 */
import { COMPONENTS } from './components/index.js';
import { hasArabic, normalizeWord, splitWords } from './text.js';

export interface Suggestion {
  use: string;
  /** Short human reason, e.g. `"race" → lanes`. */
  reason: string;
  /** Word of the line the element enters on. */
  word: string;
  props: Record<string, unknown>;
  enter: { at: string; anim: string };
  score: number;
}

interface Rule {
  use: string;
  /** Normalized keywords (lowercase, no punctuation, Arabic letter variants folded). */
  words: string[];
  weight: number;
  anim: string;
  /** Also trigger on the first word holding a digit. */
  digits?: boolean;
  props: (ctx: Ctx) => Record<string, unknown> | null;
}

interface Ctx {
  /** Time expression of the trigger word; props times are offsets from it. */
  at: string;
  text: string;
  words: string[];
  /** The keyword as written in the line. */
  hit: string;
  rtl: boolean;
  /** Short title-like phrase from the line (≤ 6 words). */
  phrase: string;
}

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
const clean = (w: string) => w.replace(/^[«"'“(]+|[»"'”).,!?؟،:;…]+$/g, '');

/** Number written in the line (12,000 · 3.5 · 40% · ١٢٠), with what follows it. */
function numberIn(text: string): { value: number; suffix: string } | null {
  const ascii = text.replace(/[٠-٩]/g, (d) => String('٠١٢٣٤٥٦٧٨٩'.indexOf(d)));
  const m = ascii.match(/(\d[\d,]*(?:\.\d+)?)\s*(%|k\b|m\b|ms\b|x\b)?\s*([A-Za-z\u0600-\u06FF/]+)?/i);
  if (!m) return null;
  let value = Number(m[1].replace(/,/g, ''));
  const unit = (m[2] ?? '').toLowerCase();
  if (unit === 'k') value *= 1000;
  if (unit === 'm') value *= 1_000_000;
  if (!Number.isFinite(value)) return null;
  const next = m[3] && !MAGNITUDE[foldNum(m[3])] ? ` ${m[3]}` : '';
  const suffix = unit === '%' ? '%' : unit === 'ms' ? ' ms' : unit === 'x' ? '×' : next;
  return { value, suffix: suffix.slice(0, 16) };
}

/**
 * Number words: English, and Arabic in MSA plus common Egyptian, Levantine, Gulf and Maghrebi forms.
 * Keys are folded with `foldNum` (normalizeWord + ة→ه, ى→ي) so spelling variants share one entry.
 */
const SMALL_WORDS: [number, string[]][] = [
  [1, ['one', 'a', 'an', 'واحد', 'واحده', 'وحده']],
  [2, ['two', 'اثنان', 'اثنين', 'اتنين', 'ثنين', 'تنين', 'زوج', 'جوج']],
  [3, ['three', 'ثلاث', 'ثلاثه', 'تلات', 'تلاته', 'تلت', 'تلاثه']],
  [4, ['four', 'اربع', 'اربعه', 'ربعه', 'ربع']],
  [5, ['five', 'خمس', 'خمسه']],
  [6, ['six', 'ست', 'سته', 'سته']],
  [7, ['seven', 'سبع', 'سبعه']],
  [8, ['eight', 'ثمان', 'ثماني', 'ثمانيه', 'تمن', 'تمنيه', 'تمانيه', 'ثمنيه']],
  [9, ['nine', 'تسع', 'تسعه']],
  [10, ['ten', 'عشر', 'عشره']],
  [11, ['eleven', 'احدعشر', 'حداشر', 'حداش']],
  [12, ['twelve', 'اثناعشر', 'اتناشر', 'طناش']],
  [15, ['fifteen', 'خمستاشر', 'خمسطاش']],
  [20, ['twenty', 'عشرون', 'عشرين']],
  [30, ['thirty', 'ثلاثون', 'ثلاثين', 'تلاتين']],
  [40, ['forty', 'اربعون', 'اربعين', 'ربعين']],
  [50, ['fifty', 'خمسون', 'خمسين']],
  [60, ['sixty', 'ستون', 'ستين']],
  [70, ['seventy', 'سبعون', 'سبعين']],
  [80, ['eighty', 'ثمانون', 'ثمانين', 'تمانين', 'ثمنين']],
  [90, ['ninety', 'تسعون', 'تسعين']],
];
const MAGNITUDE_WORDS: [number, string[]][] = [
  [100, ['hundred', 'hundreds', 'مئه', 'مائه', 'ميه', 'مية', 'ميا', 'مئات', 'ميات']],
  [1000, ['thousand', 'thousands', 'الف', 'الاف', 'الوف']],
  [1e6, ['million', 'millions', 'مليون', 'ملايين']],
  [1e9, ['billion', 'billions', 'مليار', 'مليارات']],
];
/** Dual forms are already "two of": ألفين = 2000. */
const DUAL_WORDS: [number, string[]][] = [
  [200, ['مئتان', 'مئتين', 'ميتين', 'متين']],
  [2000, ['الفين', 'الفان']],
  [2e6, ['مليونين', 'مليونان']],
];

/** Folds Arabic spelling variants for number lookup. */
const foldNum = (w: string): string => normalizeWord(w).replace(/ة/g, 'ه').replace(/ى/g, 'ي');
const table = (rows: [number, string[]][]): Record<string, number> =>
  Object.fromEntries(rows.flatMap(([n, ws]) => ws.map((w) => [foldNum(w), n])));
const SMALL = table(SMALL_WORDS);
const MAGNITUDE = table(MAGNITUDE_WORDS);
const DUAL = table(DUAL_WORDS);

/** "ten thousand" → 10000, "ألفين" → 2000, "جوج مليون" → 2000000: a number written in words, or 0. */
function numberWords(words: string[]): number {
  const n = words.map((w) => foldNum(clean(w)));
  for (let i = 0; i < n.length; i++) {
    if (DUAL[n[i]]) return DUAL[n[i]];
    const mag = MAGNITUDE[n[i]];
    if (!mag) continue;
    const before = SMALL[n[i - 1] ?? ''];
    return (before ?? 1) * mag;
  }
  return 0;
}

/** Latin technical terms in the line (client, request, Redis…), deduplicated. */
function terms(words: string[]): string[] {
  const out: string[] = [];
  for (const w of words.map(clean))
    if (/^[A-Za-z][\w.+#-]{1,24}$/.test(w) && !STOP.has(w.toLowerCase())) out.push(w);
  return [...new Set(out)];
}
const STOP = new Set(
  'the a an and or but of to in on at is are was were be it this that with for your you we our they their what if so then when how why not no just get got has have can will one each every all by as from into out up'.split(
    ' ',
  ),
);

const RULES: Rule[] = [
  {
    use: 'lanes',
    words: [
      'race',
      'concurrent',
      'concurrently',
      'parallel',
      'simultaneously',
      'twice',
      'duplicate',
      'conflict',
      'deadlock',
      'نفس',
      'مرتين',
      'متزامن',
      'تزامن',
      'بالتوازي',
    ],
    weight: 3,
    anim: 'pop',
    props: ({ words, at }) => {
      const t = terms(words);
      const a = t[0] ?? 'Request A';
      const b = t[1] ?? 'Request B';
      return {
        lanes: [
          {
            title: a,
            color: 'cyan',
            steps: [
              { text: 'read', at: `${at}+0.2` },
              { text: 'write', at: `${at}+1` },
            ],
          },
          {
            title: b,
            color: 'violet',
            steps: [
              { text: 'read', at: `${at}+0.6` },
              { text: 'write', at: `${at}+1.4`, mark: 'err' },
            ],
          },
        ],
      };
    },
  },
  {
    use: 'arrow',
    words: [
      'retry',
      'retries',
      'request',
      'requests',
      'send',
      'sends',
      'sent',
      'call',
      'calls',
      'forward',
      'forwards',
      'route',
      'routes',
      'flow',
      'flows',
      'webhook',
      'بعت',
      'يبعت',
      'ارسل',
      'يرسل',
      'طلب',
    ],
    weight: 2,
    anim: 'draw',
    props: ({ hit }) => ({
      from: { x: 160, y: 500 },
      to: { x: 860, y: 500 },
      label: clean(hit).slice(0, 18),
      packet: true,
    }),
  },
  {
    use: 'node',
    words: [
      'server',
      'servers',
      'database',
      'db',
      'api',
      'service',
      'client',
      'cache',
      'redis',
      'queue',
      'worker',
      'gateway',
      'backend',
      'frontend',
      'kafka',
      'postgres',
      'mysql',
      'سيرفر',
      'خادم',
      'قاعدة',
    ],
    weight: 2,
    anim: 'pop',
    props: ({ hit }) => {
      const w = clean(hit);
      const n = normalizeWord(w);
      const icon = /db|database|postgres|mysql|قاعده/.test(n)
        ? 'db'
        : /client|user/.test(n)
          ? 'user'
          : /queue|kafka/.test(n)
            ? 'queue'
            : 'server';
      return { title: /^[a-z]/i.test(w) && w.length <= 4 ? w.toUpperCase() : cap(w), icon, status: 'idle' };
    },
  },
  {
    use: 'table',
    words: [
      'table',
      'compare',
      'comparison',
      'versus',
      'vs',
      'columns',
      'rows',
      'difference',
      'جدول',
      'مقارنة',
      'مقارنه',
      'الفرق',
    ],
    weight: 3,
    anim: 'pop',
    props: ({ text, words }) => {
      const vs = text.match(/([\w\u0600-\u06FF]+)\s+(?:vs\.?|versus|و|or)\s+([\w\u0600-\u06FF]+)/i);
      const t = terms(words);
      const cols = vs ? [vs[1], vs[2]] : t.length >= 2 ? t.slice(0, 2) : ['Before', 'After'];
      return {
        columns: ['', ...cols.map((c) => cap(clean(c)))],
        rows: [{ cells: ['Speed', '✓', '✗'] }, { cells: ['Cost', '✗', '✓'] }],
      };
    },
  },
  {
    use: 'bucket',
    words: ['bucket', 'token', 'tokens', 'refill', 'throttle', 'throttling', 'burst', 'bursts', 'quota'],
    weight: 3,
    anim: 'pop',
    props: ({ at }) => ({ capacity: 10, keyframes: [{ at: `${at}+0.8`, tokens: 6 }], label: 'tokens' }),
  },
  {
    use: 'meter',
    words: [
      'limit',
      'limits',
      'threshold',
      'cpu',
      'memory',
      'usage',
      'load',
      'capacity',
      'latency',
      'percent',
      'الحد',
      'الضغط',
      'الحمل',
    ],
    weight: 2,
    anim: 'pop',
    props: ({ text, hit, at }) => {
      const n = numberIn(text);
      const pct = n && n.suffix === '%' ? Math.min(100, n.value) : 85;
      return {
        keyframes: [{ at, value: pct, dur: 1.2 }],
        max: 100,
        threshold: 80,
        label: cap(clean(hit)),
        unit: '%',
      };
    },
  },
  {
    use: 'counter',
    // A count needs a number: digits (matched below) or a number word.
    words: [
      'hundred',
      'hundreds',
      'million',
      'millions',
      'thousand',
      'thousands',
      'billion',
      'billions',
      'مية',
      'مئة',
      'ميه',
      'ميا',
      'مليون',
      'ملايين',
      'الف',
      'ألف',
      'آلاف',
      'الفين',
      'ألفين',
      'مليار',
    ],
    digits: true,
    weight: 2,
    anim: 'count',
    props: ({ text, words, at }) => {
      const n = numberIn(text);
      const word = numberWords(words);
      if (!n && !word) return null;
      // "3 million" → 3e6; "12,000" stays as written.
      const mag =
        word && n ? (Object.values(MAGNITUDE).find((m) => word % m === 0 && word / m < 1000) ?? 1) : 1;
      const value = n ? n.value * (n.value < 1000 ? mag : 1) : word;
      const unit = /percent|المية/i.test(text) ? '%' : /per second|في الثانية|\/s\b/i.test(text) ? '/s' : '';
      return { from: 0, keyframes: [{ at, value, dur: 1.2 }], suffix: n?.suffix || unit };
    },
  },
  {
    use: 'checklist',
    words: [
      'steps',
      'checklist',
      'rules',
      'tips',
      'firstly',
      'finally',
      'remember',
      'خطوات',
      'قواعد',
      'نصائح',
      'اولا',
      'أولا',
      'ثانيا',
      'تذكر',
    ],
    weight: 2,
    anim: 'pop',
    props: ({ words }) => {
      const t = terms(words);
      return {
        items: (t.length >= 2 ? t.slice(0, 3) : ['Validate input', 'Retry safely', 'Log it']).map((x) => ({
          text: cap(x),
        })),
      };
    },
  },
  {
    use: 'timeline',
    words: [
      'timeline',
      'history',
      'before',
      'after',
      'then',
      'later',
      'years',
      'year',
      'phase',
      'phases',
      'stages',
      'قبل',
      'بعد',
      'مراحل',
      'سنة',
      'سنوات',
    ],
    weight: 1,
    anim: 'pop',
    props: () => ({
      markers: [
        { pos: 0.1, label: 'before' },
        { pos: 0.9, label: 'after' },
      ],
    }),
  },
  {
    use: 'code',
    words: [
      'code',
      'function',
      'query',
      'select',
      'sql',
      'json',
      'loop',
      'variable',
      'class',
      'method',
      'kod',
      'كود',
      'دالة',
      'استعلام',
    ],
    weight: 3,
    anim: 'type',
    props: ({ text }) =>
      /select|sql|query|استعلام/i.test(text)
        ? { lang: 'sql', lines: ['SELECT * FROM orders', '  WHERE id = $1', '  FOR UPDATE;'] }
        : {
            lang: 'ts',
            lines: [
              'async function handle(req) {',
              '  const key = req.headers.idempotency;',
              '  return process(key);',
              '}',
            ],
          },
  },
  {
    use: 'phone',
    words: [
      'phone',
      'app',
      'payment',
      'pay',
      'checkout',
      'notification',
      'notifications',
      'mobile',
      'tap',
      'الدفع',
      'تطبيق',
      'موبايل',
      'اشعار',
      'إشعار',
    ],
    weight: 3,
    anim: 'rise',
    props: () => ({ title: 'Checkout', amount: '$49.00', button: 'Pay now' }),
  },
  {
    use: 'trap',
    words: [
      'trap',
      'mistake',
      'mistakes',
      'wrong',
      'never',
      'dont',
      "don't",
      'bug',
      'pitfall',
      'careful',
      'فخ',
      'غلط',
      'خطأ',
      'خطا',
      'احذر',
    ],
    weight: 2,
    anim: 'glitch',
    props: ({ phrase }) => ({ title: 'THE TRAP', sub: phrase.slice(0, 40) }),
  },
  {
    use: 'grid',
    words: [
      'shards',
      'shard',
      'partitions',
      'partition',
      'cluster',
      'nodes',
      'replicas',
      'servers',
      'instances',
    ],
    weight: 2,
    anim: 'pop',
    props: () => ({ cols: 4, rows: 2, tiles: [] }),
  },
  {
    use: 'cta',
    words: [
      'next',
      'follow',
      'subscribe',
      'comment',
      'episode',
      'part',
      'تابع',
      'تابعني',
      'علق',
      'الحلقة',
      'الجاية',
      'القادمة',
    ],
    weight: 2,
    anim: 'rise',
    props: ({ words }) => ({ next: cap(terms(words)[0] ?? 'Next episode') }),
  },
  {
    use: 'quote',
    words: ['said', 'says', 'quote', 'law', 'principle', 'قال', 'قانون', 'مبدأ'],
    weight: 2,
    anim: 'rise',
    props: ({ text }) => ({ text: text.replace(/^[«"“]|[»"”]$/g, '').slice(0, 140) }),
  },
  {
    use: 'stamp',
    words: [
      'rejected',
      'denied',
      'blocked',
      'failed',
      'fail',
      'error',
      'approved',
      'done',
      'solved',
      'مرفوض',
      'فشل',
      'تم',
    ],
    weight: 2,
    anim: 'stamp',
    props: ({ hit }) => ({
      text: clean(hit).toUpperCase().slice(0, 14),
      color: /approved|done|solved|تم/i.test(hit) ? 'lime' : 'red',
    }),
  },
  {
    use: 'icon',
    words: [
      'secure',
      'security',
      'lock',
      'password',
      'email',
      'mail',
      'cloud',
      'clock',
      'time',
      'fire',
      'key',
      'wifi',
      'offline',
      'امان',
      'أمان',
      'قفل',
      'سحابة',
    ],
    weight: 1,
    anim: 'pop',
    props: ({ hit }) => {
      const n = normalizeWord(clean(hit));
      const name = /lock|secur|password|امان|قفل/.test(n)
        ? 'lock'
        : /mail/.test(n)
          ? 'mail'
          : /cloud|سحاب/.test(n)
            ? 'cloud'
            : /clock|time/.test(n)
              ? 'clock'
              : /fire/.test(n)
                ? 'fire'
                : /key/.test(n)
                  ? 'key'
                  : /offline/.test(n)
                    ? 'wifi-off'
                    : 'wifi';
      return { name, pulse: true };
    },
  },
];

const RULE_WORDS = RULES.map((r) => new Set(r.words.map(normalizeWord)));

/** Time expression for a word of a line: `l3:'word'` (with #n when repeated), or `l3.4`. */
export function wordExpr(lineId: string, words: string[], index: number): string {
  const w = clean(words[index]);
  if (!w || /['"’]/.test(w)) return `${lineId}.${index}`;
  const n = normalizeWord(w);
  const occ = words.slice(0, index + 1).filter((x) => normalizeWord(clean(x)) === n).length;
  return `${lineId}:'${w}'${occ > 1 ? `#${occ}` : ''}`;
}

/**
 * Component suggestions for one script line, best first. `first` marks the hook line (a title is
 * always offered there). Only suggestions whose props pass the component schema are returned.
 */
export function suggestForLine(
  line: { id: string; text: string },
  opts: { limit?: number; first?: boolean } = {},
): Suggestion[] {
  const words = splitWords(line.text);
  const norm = words.map((w) => normalizeWord(clean(w)));
  const rtl = hasArabic(line.text);
  const phraseWords = words.filter((w) => !STOP.has(normalizeWord(w)));
  const phrase = (phraseWords.length ? phraseWords : words).slice(0, 6).map(clean).join(' ');
  const out: Suggestion[] = [];
  RULES.forEach((rule, ri) => {
    let idx = norm.findIndex((w) => RULE_WORDS[ri].has(w));
    // Arabic article/prefix forms: الـ + term, بـ + term
    if (idx < 0)
      idx = norm.findIndex((w) => w.length > 3 && RULE_WORDS[ri].has(w.replace(/^(ال|بال|وال|لل|ب|و)/, '')));
    if (rule.digits) {
      const d = words.findIndex((w) => /[0-9٠-٩]/.test(w));
      if (d >= 0 && (idx < 0 || d < idx)) idx = d;
    }
    if (idx < 0) return;
    const at = wordExpr(line.id, words, idx);
    const ctx: Ctx = { at, text: line.text, words, hit: words[idx], rtl, phrase };
    const props = rule.props(ctx);
    if (!props) return;
    out.push({
      use: rule.use,
      reason: `"${clean(words[idx])}" → ${rule.use}`,
      word: clean(words[idx]),
      props,
      enter: { at, anim: rule.anim },
      // Earlier words first (they appear first), stronger rules first.
      score: rule.weight + 1 - idx / Math.max(1, words.length),
    });
  });
  if (opts.first || line.text.trim().endsWith('?') || line.text.trim().endsWith('؟') || !out.length) {
    // Enter on the first meaningful word (not a stop word or a bare article such as الـ).
    const k = Math.max(
      0,
      words.findIndex((w) => {
        const n = normalizeWord(clean(w));
        return n.length > 2 && !STOP.has(n) && !w.endsWith('\u0640');
      }),
    );
    const titleWords = phrase.split(' ');
    const accent = titleWords.reduce((a, b) => (b.length > a.length ? b : a), '');
    out.push({
      use: 'title',
      reason: opts.first ? 'hook line → title' : 'key phrase → title',
      word: clean(words[k] ?? ''),
      props: { text: phrase.replace(accent, `**${accent}**`) },
      enter: { at: wordExpr(line.id, words, k), anim: 'reveal' },
      score: opts.first ? 5 : 0.5,
    });
  }
  const valid = out.filter((s) => COMPONENTS[s.use]?.schema.safeParse(s.props).success);
  valid.sort((a, b) => b.score - a.score);
  const seen = new Set<string>();
  return valid.filter((s) => !seen.has(s.use) && seen.add(s.use)).slice(0, opts.limit ?? 4);
}
