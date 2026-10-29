// Regenerates the example episodes of every industry pack from its templates, so they stay in sync:
//   node scripts/gen-pack-examples.mjs              all packs
//   node scripts/gen-pack-examples.mjs healthcare   one pack
// Each example is packs/<pack>/examples/<name>-<lang>/ with episode.yaml (core fillTemplate, then
// prettier) and draft cues (`reelforge cue <dir> --draft`). Needs `pnpm build` first.
import { spawnSync } from 'node:child_process';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import prettier from 'prettier';
import { fillTemplate, findTemplate, listPacks } from '../packages/core/dist/index.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const BIN = path.join(ROOT, 'packages/cli/bin/reelforge.js');

/** One example per pack: a template and realistic slot values for each language (fictional names). */
const EXAMPLES = [
  {
    pack: 'healthcare',
    template: 'patient-journey',
    name: 'first-visit',
    slots: {
      en: {
        org: 'Northwind Hospital',
        desk: 'the main desk',
        wait: 10,
        next: 'Preparing for a lab test',
        keyword: 'VISIT',
      },
      ar: {
        org: 'مستشفى نورثويند',
        desk: 'مكتب الاستقبال',
        wait: 10,
        next: 'التحضير لتحليل الدم',
        keyword: 'زيارة',
      },
    },
  },
  {
    pack: 'real-estate',
    template: 'property-tour',
    name: 'maple-court',
    slots: {
      en: {
        org: 'Cedar Homes',
        place: 'Maple Court',
        area: 'Oakridge',
        rooms: 3,
        size: 118,
        feature: 'sunny balcony',
        price: 'on request',
        keyword: 'TOUR',
      },
      ar: {
        org: 'سيدار هومز',
        place: 'ميبل كورت',
        area: 'حي أوكريدج',
        rooms: 3,
        size: 118,
        feature: 'الشرفة المشمسة',
        price: 'عند الطلب',
        keyword: 'معاينة',
      },
    },
  },
  {
    pack: 'ports-logistics',
    template: 'container-journey',
    name: 'azur-container',
    slots: {
      en: { org: 'Port of Azur', days: 4, next: 'How truck slots work', keyword: 'SLOTS' },
      ar: { org: 'ميناء أزور', days: 4, next: 'مواعيد الشاحنات', keyword: 'مواعيد' },
    },
  },
  {
    pack: 'education',
    template: 'concept-explainer',
    name: 'photosynthesis',
    slots: {
      en: {
        org: 'Westfield Academy',
        subject: 'Biology',
        concept: 'Photosynthesis',
        part1: 'Sunlight',
        part2: 'Water',
        part3: 'Carbon dioxide',
        result: 'Sugar and oxygen',
        keyword: 'NEXT',
      },
      ar: {
        org: 'أكاديمية ويستفيلد',
        subject: 'الأحياء',
        concept: 'البناء الضوئي',
        part1: 'ضوء الشمس',
        part2: 'الماء',
        part3: 'ثاني أكسيد الكربون',
        result: 'سكر وأكسجين',
        keyword: 'التالي',
      },
    },
  },
  {
    pack: 'finance',
    template: 'budget-basics',
    name: 'budget-split',
    slots: {
      en: {
        org: 'Brightway Bank',
        income: 2400,
        currency: 'EUR',
        needs: 50,
        wants: 30,
        savings: 20,
        keyword: 'BUDGET',
      },
      ar: {
        org: 'بنك برايتواي',
        income: 15000,
        currency: 'EGP',
        needs: 50,
        wants: 30,
        savings: 20,
        keyword: 'ميزانية',
      },
    },
  },
  {
    pack: 'food',
    template: 'dish-in-steps',
    name: 'shakshuka',
    slots: {
      en: {
        org: 'Maple Street Bistro',
        dish: 'Shakshuka',
        step1: 'Soften onion and pepper',
        step2: 'Add tomatoes and spices',
        step3: 'Simmer until thick',
        step4: 'Crack in the eggs',
        minutes: 25,
        keyword: 'TABLE',
      },
      ar: {
        org: 'بيسترو شارع القيقب',
        dish: 'الشكشوكة',
        step1: 'نشوّح البصل والفلفل',
        step2: 'نضيف الطماطم والتوابل',
        step3: 'نسيبها تتسبك',
        step4: 'نكسر البيض فوقها',
        minutes: 25,
        keyword: 'ترابيزة',
      },
    },
  },
  {
    pack: 'retail',
    template: 'click-and-collect',
    name: 'bluebell-pickup',
    slots: {
      en: { org: 'Bluebell Market', store: 'Main Street store', hours: 2, keyword: 'RETURNS' },
      ar: { org: 'بلوبيل ماركت', store: 'فرع الشارع الرئيسي', hours: 2, keyword: 'استرجاع' },
    },
  },
  {
    pack: 'government',
    template: 'renew-document',
    name: 'westbrook-renewal',
    slots: {
      en: { city: 'City of Westbrook', doc: 'residence card', days: 10, keyword: 'BOOK' },
      ar: { city: 'مدينة ويستبروك', doc: 'بطاقة الإقامة', days: 10, keyword: 'موعد' },
    },
  },
  {
    pack: 'tourism',
    template: 'itinerary-3-days',
    name: 'azur-bay',
    slots: {
      en: {
        org: 'Voyager Tours',
        place: 'Azur Bay',
        day1: 'the old harbor',
        day2: 'a boat to the islands',
        day3: 'the hill fort',
        keyword: 'FOOD',
      },
      ar: {
        org: 'فوياجر تورز',
        place: 'خليج أزور',
        day1: 'الميناء القديم',
        day2: 'مركب للجزر',
        day3: 'قلعة التل',
        keyword: 'أكل',
      },
    },
  },
  {
    pack: 'manufacturing',
    template: 'part-journey',
    name: 'bracket-line',
    slots: {
      en: {
        plant: 'Ridgeway Plant',
        part: 'steel bracket',
        material: 'a steel sheet',
        minutes: 6,
        keyword: 'QC',
      },
      ar: { plant: 'مصنع ريدجواي', part: 'الدعامة المعدنية', material: 'لوح صاج', minutes: 6, keyword: 'QC' },
    },
  },
  {
    pack: 'events-ngo',
    template: 'donation-impact',
    name: 'open-hands',
    slots: {
      en: {
        org: 'Open Hands Foundation',
        cause: 'meals for families',
        meals: 72,
        transport: 18,
        training: 10,
        keyword: 'HELP',
      },
      ar: {
        org: 'مؤسسة الأيادي المفتوحة',
        cause: 'وجبات للأسر',
        meals: 72,
        transport: 18,
        training: 10,
        keyword: 'مساعدة',
      },
    },
  },
  {
    pack: 'tech',
    template: 'system-concept',
    name: 'rate-limiting',
    slots: {
      en: {
        concept: 'Rate Limiting',
        component: 'Rate limiter',
        limit: 100,
        unit: 'req/s',
        next: 'Caching and stampedes',
        keyword: 'CACHE',
      },
      ar: {
        concept: 'Rate Limiting',
        component: 'Rate limiter',
        limit: 100,
        unit: 'req/s',
        next: 'الـ Caching والـ Stampede',
        keyword: 'cache',
      },
    },
  },
];

const only = process.argv[2];
const { packs, errors } = listPacks();
if (errors.length) {
  console.error(errors.join('\n'));
  process.exit(1);
}
const config = (await prettier.resolveConfig(path.join(ROOT, 'packs', 'x.yaml'))) ?? {};
let failed = false;
for (const ex of EXAMPLES) {
  if (only && ex.pack !== only) continue;
  const { pack, template } = findTemplate(packs, ex.pack, ex.template);
  for (const lang of /** @type {const} */ (['en', 'ar'])) {
    const id = `${ex.name}-${lang}`;
    const dir = path.join(pack.dir, 'examples', id);
    const { yaml } = fillTemplate(pack, template, { lang, id, slots: ex.slots[lang] });
    const file = template.files[lang] ?? template.files.en;
    const header = `# Generated by scripts/gen-pack-examples.mjs from packs/${pack.id}/${file}; edit the template and re-run.\n`;
    const text = await prettier.format(header + yaml.replace(/^#.*\n/, ''), { ...config, parser: 'yaml' });
    mkdirSync(dir, { recursive: true });
    writeFileSync(path.join(dir, 'episode.yaml'), text);
    rmSync(path.join(dir, 'cues.json'), { force: true });
    const r = spawnSync(process.execPath, [BIN, 'cue', dir, '--draft'], { encoding: 'utf8' });
    if (r.status !== 0) {
      failed = true;
      console.error(`✗ ${path.relative(ROOT, dir)}: ${r.stderr.trim()}`);
    } else console.log(`✓ ${path.relative(ROOT, dir)}`);
  }
}
if (failed) process.exitCode = 1;
