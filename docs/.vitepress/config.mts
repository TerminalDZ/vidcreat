import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig, type DefaultTheme } from 'vitepress';

const REPO_URL = 'https://github.com/TerminalDZ/vidcreat';
const DOCS_URL = 'https://terminaldz.github.io/vidcreat';

/**
 * The public site is built for GitHub Pages under /vidcreat/. `pnpm docs:local`
 * (scripts/build-docs-site.mjs) builds the same pages a second time with DOCS_BASE=/docs/ (and DOCS_OUT,
 * relative to docs/) into documentation/site for the dashboard's offline /docs/ route.
 */
const BASE = process.env.DOCS_BASE ?? '/vidcreat/';
const LOCAL = BASE !== '/vidcreat/';

const docsDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const repoRoot = path.resolve(docsDir, '..');
const posix = (p: string) => p.split(path.sep).join('/');

/** Markdown files under docs/ that are not site pages. */
const EXCLUDED = ['PRD.md', 'SRS.md', 'components.md', 'manual/**', 'screenshots/**', '**/README.md'];
const isExcluded = (rel: string) =>
  ['PRD.md', 'SRS.md', 'components.md'].includes(rel) ||
  /^(manual|screenshots)\//.test(rel) ||
  /(^|\/)README\.md$/.test(rel);

/** The architecture guides stay at docs/architecture.md and docs/architecture-ar.md (linked from the repository). */
const REWRITES: Record<string, string> = {
  'architecture-ar.md': 'ar/guide/architecture.md',
  'architecture.md': 'guide/architecture.md',
};

/**
 * Relative links that leave docs/ (or point at excluded files and folders) go to the repository on
 * GitHub, so the same Markdown works on GitHub, in the offline build and on the site. Links in
 * rewritten pages are resolved from the source file and made absolute.
 */
function repoLinks(md: { core: { ruler: { push: (name: string, fn: (state: any) => void) => void } } }) {
  md.core.ruler.push('reelforge_repo_links', (state) => {
    const src: string | undefined = state.env?.realPath ?? state.env?.path;
    if (!src) return;
    const srcRel = posix(path.relative(docsDir, src));
    const rewritten = srcRel in REWRITES;
    for (const block of state.tokens) {
      if (block.type !== 'inline' || !block.children) continue;
      for (const t of block.children) {
        if (t.type !== 'link_open') continue;
        const href: string | null = t.attrGet('href');
        if (!href || /^([a-z][a-z0-9+.-]*:|#|\/)/i.test(href)) continue;
        const [p, hash] = href.split('#');
        if (!p) continue;
        const abs = path.resolve(path.dirname(src), decodeURIComponent(p));
        const rel = posix(path.relative(docsDir, abs));
        const isDir = p.endsWith('/') || (existsSync(abs) && statSync(abs).isDirectory());
        const page = !rel.startsWith('..') && !isDir && !isExcluded(rel);
        if (page) {
          if (rewritten || rel in REWRITES)
            t.attrSet('href', `/${REWRITES[rel] ?? rel}${hash ? `#${hash}` : ''}`);
          continue;
        }
        const fromRoot = posix(path.relative(repoRoot, abs));
        t.attrSet('href', `${REPO_URL}/${isDir ? 'tree' : 'blob'}/main/${fromRoot}${hash ? `#${hash}` : ''}`);
      }
    }
  });
}

/** ADR pages, read from docs/adr so a new record appears without editing this file. */
function adrItems(): DefaultTheme.SidebarItem[] {
  return readdirSync(path.join(docsDir, 'adr'))
    .filter((f) => /^\d+.*\.md$/.test(f))
    .sort()
    .map((f) => {
      const h1 = readFileSync(path.join(docsDir, 'adr', f), 'utf8').match(/^# (.*)$/m)?.[1] ?? f;
      return { text: h1.replace(/`/g, ''), link: `/adr/${f.replace(/\.md$/, '')}` };
    });
}

const PACKS = [
  'healthcare',
  'real-estate',
  'ports-logistics',
  'education',
  'finance',
  'food',
  'retail',
  'government',
  'tourism',
  'manufacturing',
  'events-ngo',
  'tech',
] as const;

const PACK_NAMES: Record<(typeof PACKS)[number], [string, string]> = {
  healthcare: ['Healthcare', 'الرعاية الصحية'],
  'real-estate': ['Real estate', 'العقارات'],
  'ports-logistics': ['Ports and logistics', 'الموانئ والخدمات اللوجستية'],
  education: ['Education', 'التعليم'],
  finance: ['Finance', 'المالية'],
  food: ['Food and hospitality', 'المطاعم والضيافة'],
  retail: ['Retail', 'التجزئة'],
  government: ['Government services', 'الخدمات الحكومية'],
  tourism: ['Tourism and travel', 'السياحة والسفر'],
  manufacturing: ['Manufacturing', 'التصنيع'],
  'events-ngo': ['Events and non-profits', 'الفعاليات والجمعيات'],
  tech: ['Tech and software', 'التقنية والبرمجيات'],
};

function sidebarEn(): DefaultTheme.SidebarItem[] {
  return [
    {
      text: 'Getting started',
      items: [
        { text: 'Introduction and concepts', link: '/guide/introduction' },
        { text: 'Installation', link: '/guide/installation' },
        { text: 'Quick start', link: '/guide/quick-start' },
      ],
    },
    {
      text: 'Tutorials',
      collapsed: true,
      items: [
        { text: 'Overview', link: '/guide/tutorials/' },
        ...PACKS.map((p) => ({ text: PACK_NAMES[p][0], link: `/guide/tutorials/${p}` })),
      ],
    },
    {
      text: 'Guides',
      items: [
        { text: 'Templates and packs', link: '/guide/templates-and-packs' },
        { text: 'Dashboard', link: '/guide/dashboard' },
        { text: 'Editor', link: '/guide/editor' },
        { text: 'Timing, cues and alignment', link: '/guide/timing' },
        { text: 'Writing episodes', link: '/authoring' },
        { text: 'Themes and branding', link: '/guide/themes' },
        { text: 'Rendering and publishing', link: '/guide/rendering' },
        { text: 'Command line', link: '/guide/command-line' },
      ],
    },
    {
      text: 'AI integration',
      items: [
        { text: 'Overview', link: '/guide/ai' },
        { text: 'Client setup', link: '/reference/ai-clients' },
        { text: 'MCP tools and REST', link: '/reference/mcp-tools' },
      ],
    },
    {
      text: 'Reference',
      items: [
        { text: 'Episode format', link: '/reference/episode-format' },
        { text: 'Components', link: '/reference/components' },
        { text: 'CLI', link: '/reference/cli' },
        { text: 'Pack catalog', link: '/reference/packs' },
      ],
    },
    {
      text: 'Project',
      items: [
        { text: 'Architecture', link: '/guide/architecture' },
        { text: 'Decision records', collapsed: true, items: adrItems() },
        { text: 'Contributing', link: '/guide/contributing' },
        { text: 'FAQ and troubleshooting', link: '/guide/faq' },
        { text: 'Changelog', link: '/guide/changelog' },
        { text: 'License', link: '/guide/license' },
      ],
    },
  ];
}

function sidebarAr(): DefaultTheme.SidebarItem[] {
  return [
    {
      text: 'البداية',
      items: [
        { text: 'مقدمة ومفاهيم', link: '/ar/guide/introduction' },
        { text: 'التثبيت', link: '/ar/guide/installation' },
        { text: 'البدء السريع', link: '/ar/guide/quick-start' },
      ],
    },
    {
      text: 'دروس تطبيقية',
      collapsed: true,
      items: [
        { text: 'نظرة عامة', link: '/ar/guide/tutorials/' },
        ...PACKS.map((p) => ({ text: PACK_NAMES[p][1], link: `/ar/guide/tutorials/${p}` })),
      ],
    },
    {
      text: 'الأدلة',
      items: [
        { text: 'القوالب والحزم', link: '/ar/guide/templates-and-packs' },
        { text: 'لوحة التحكم', link: '/ar/guide/dashboard' },
        { text: 'المحرر', link: '/ar/guide/editor' },
        { text: 'التوقيت والـ cues والمحاذاة', link: '/ar/guide/timing' },
        { text: 'كتابة الحلقات', link: '/ar/authoring' },
        { text: 'الثيمات والهوية', link: '/ar/guide/themes' },
        { text: 'التصدير والنشر', link: '/ar/guide/rendering' },
        { text: 'سطر الأوامر', link: '/ar/guide/command-line' },
      ],
    },
    {
      text: 'التكامل مع الذكاء الاصطناعي',
      items: [
        { text: 'نظرة عامة', link: '/ar/guide/ai' },
        { text: 'إعداد العملاء', link: '/ar/reference/ai-clients' },
        { text: 'أدوات MCP وواجهة REST', link: '/ar/reference/mcp-tools' },
      ],
    },
    {
      text: 'المرجع',
      items: [
        { text: 'صيغة الحلقة', link: '/ar/reference/episode-format' },
        { text: 'المكوّنات', link: '/ar/reference/components' },
        { text: 'مرجع CLI', link: '/ar/reference/cli' },
        { text: 'فهرس الحزم', link: '/ar/reference/packs' },
      ],
    },
    {
      text: 'المشروع',
      items: [
        { text: 'البنية المعمارية', link: '/ar/guide/architecture' },
        { text: 'سجلات القرارات', link: '/ar/guide/adr' },
        { text: 'المساهمة', link: '/ar/guide/contributing' },
        { text: 'أسئلة شائعة وحل المشكلات', link: '/ar/guide/faq' },
        { text: 'سجل التغييرات', link: '/ar/guide/changelog' },
        { text: 'الترخيص', link: '/ar/guide/license' },
      ],
    },
  ];
}

export default defineConfig({
  title: 'ReelForge',
  description:
    'Voice recording + one YAML file → a finished vertical explainer video. Local and deterministic.',
  base: BASE,
  outDir: process.env.DOCS_OUT ?? '.site',
  srcExclude: EXCLUDED,
  rewrites: REWRITES,
  cleanUrls: false,
  lastUpdated: false,
  // Dead links fail the build; only local server URLs in examples are allowed.
  ignoreDeadLinks: ['localhostLinks'],
  head: [
    ['link', { rel: 'icon', href: `${BASE}favicon.svg`, type: 'image/svg+xml' }],
    ['meta', { property: 'og:image', content: `${DOCS_URL}/cover.jpg` }],
  ],
  markdown: {
    config: (md) => {
      repoLinks(md as never);
      // Inline code is literal text: `{{slot}}` must not become a Vue interpolation.
      const inline = md.renderer.rules.code_inline!;
      md.renderer.rules.code_inline = (tokens, idx, options, env, self) =>
        inline(tokens, idx, options, env, self).replace(/^<code/, '<code v-pre');
    },
  },
  sitemap: LOCAL ? undefined : { hostname: `${DOCS_URL}/` },
  themeConfig: {
    logo: { src: '/favicon.svg', alt: '' },
    socialLinks: [{ icon: 'github', link: REPO_URL }],
    search: {
      provider: 'local',
      options: {
        locales: {
          ar: {
            translations: {
              button: { buttonText: 'بحث', buttonAriaLabel: 'بحث' },
              modal: {
                displayDetails: 'عرض التفاصيل',
                resetButtonTitle: 'مسح البحث',
                backButtonTitle: 'إغلاق البحث',
                noResultsText: 'لا توجد نتائج لـ',
                footer: { selectText: 'فتح', navigateText: 'تنقل', closeText: 'إغلاق' },
              },
            },
          },
        },
      },
    },
  },
  locales: {
    root: {
      label: 'English',
      lang: 'en',
      dir: 'ltr',
      themeConfig: {
        nav: [
          { text: 'Guide', link: '/guide/introduction', activeMatch: '/guide/' },
          { text: 'Reference', link: '/reference/episode-format', activeMatch: '/reference/' },
          { text: 'AI integration', link: '/guide/ai' },
          { text: 'Changelog', link: '/guide/changelog' },
        ],
        sidebar: sidebarEn(),
        editLink: { pattern: `${REPO_URL}/edit/main/docs/:path`, text: 'Edit this page on GitHub' },
        footer: {
          message:
            'Code under the <a href="https://github.com/TerminalDZ/vidcreat/blob/main/LICENSE">Apache License 2.0</a>. Documentation under <a href="https://github.com/TerminalDZ/vidcreat/blob/main/docs/LICENSE-CONTENT.md">CC BY 4.0</a>.',
          copyright: 'ReelForge contributors',
        },
        outline: { level: [2, 3] },
      },
    },
    ar: {
      label: 'العربية',
      lang: 'ar',
      dir: 'rtl',
      link: '/ar/',
      title: 'ReelForge',
      description: 'تسجيل صوتي وملف YAML واحد ينتجان فيديو شرح عمودياً جاهزاً للنشر. محلي وحتمي.',
      themeConfig: {
        nav: [
          { text: 'الدليل', link: '/ar/guide/introduction', activeMatch: '/ar/guide/' },
          { text: 'المرجع', link: '/ar/reference/episode-format', activeMatch: '/ar/reference/' },
          { text: 'الذكاء الاصطناعي', link: '/ar/guide/ai' },
          { text: 'سجل التغييرات', link: '/ar/guide/changelog' },
        ],
        sidebar: sidebarAr(),
        editLink: { pattern: `${REPO_URL}/edit/main/docs/:path`, text: 'عدّل هذه الصفحة على GitHub' },
        footer: {
          message:
            'الكود مرخّص بـ <a href="https://github.com/TerminalDZ/vidcreat/blob/main/LICENSE">Apache License 2.0</a>. التوثيق مرخّص بـ <a href="https://github.com/TerminalDZ/vidcreat/blob/main/docs/LICENSE-CONTENT.md">CC BY 4.0</a>.',
          copyright: 'المساهمون في ReelForge',
        },
        outline: { level: [2, 3], label: 'في هذه الصفحة' },
        docFooter: { prev: 'السابق', next: 'التالي' },
        darkModeSwitchLabel: 'المظهر',
        lightModeSwitchTitle: 'الوضع الفاتح',
        darkModeSwitchTitle: 'الوضع الداكن',
        sidebarMenuLabel: 'القائمة',
        returnToTopLabel: 'العودة إلى الأعلى',
        langMenuLabel: 'اللغة',
        notFound: {
          title: 'الصفحة غير موجودة',
          quote: 'تحقق من الرابط أو عد إلى الصفحة الرئيسية.',
          linkText: 'الصفحة الرئيسية',
        },
      },
    },
  },
});
