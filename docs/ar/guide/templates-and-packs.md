# القوالب والحزم

تجمع **الحزمة القطاعية** ما يحتاجه قطاع واحد: ثيماً، وقالبين أو ثلاثة، ومخططات مشاهد (blueprints) مقترحة،
وحلقة مثال بالعربية والإنجليزية، ودليلاً لمساعدي الذكاء الاصطناعي. **القالب** حلقة كاملة (نص ومشاهد وتوقيت)
فيها حقول مسمّاة (**slots**)، مثل اسم الجهة أو رقم أو كلمة مفتاحية للدعوة إلى التفاعل. بملء هذه الحقول
تحصل على حلقة صالحة ومصممة في ثوانٍ، ثم تحسّنها كأي حلقة أخرى.

يعرض [فهرس الحزم](../reference/packs.md) كل حزمة وقالب وحقل، وهو مولّد من الملفات الموجودة في `packs/`.

## أنشئ حلقة من قالب

من سطر الأوامر:

```bash
reelforge packs                      # كل الحزم والقوالب مع حقولها (--json للتفاصيل)
reelforge new first-visit --pack healthcare --template patient-journey --lang ar \
  --slot "org=مستشفى نورثويند" --slot wait=10
```

يستخدم الخيار `--lang en` النسخة الإنجليزية من القالب. يمكن تكرار `--slot key=value`، والحقول التي لا تملؤها
تحتفظ بقيمها الافتراضية، وتُرفض القيمة الطويلة جداً أو الخارجة عن الحدود قبل كتابة أي ملف. ودون الخيار `--template`
يُستخدم أول قالب في الحزمة. تبدأ الحلقة بـ cues تقديرية، فتعمل المعاينة فوراً
(`reelforge snap first-visit --every 5`)؛ ثم غيّر النصوص في المحرر أو في `episode.yaml`.

من لوحة التحكم: انقر **+ New episode** ثم اختر **Start from template**، واختر حزمة وقالباً، واملأ الحقول (يعرض
حقل النص حدّ طوله، والرقم مداه، ويبدأ كل حقل بقيمته الافتراضية)، ثم اختر اللغة وانقر **Create**.

من مساعد ذكاء اصطناعي: تؤدي أدوات المستوى الأول (Tier 1) المهمة نفسها. تعيد `list_templates` القوالب مع
حقولها، وتأخذ `create_from_template` معرّف الحلقة والحزمة والقالب واللغة وكائناً مسطحاً بقيم الحقول:

```json
{
  "id": "first-visit",
  "pack": "healthcare",
  "template": "patient-journey",
  "lang": "ar",
  "slots": { "org": "مستشفى نورثويند", "wait": 10, "keyword": "زيارة" }
}
```

## الحقول (slots)

| نوع الحقل | القيمة                             | الحدود                   |
| --------- | ---------------------------------- | ------------------------ |
| `text`    | نص قصير (النوع الافتراضي)          | عدد أقصى من الأحرف `max` |
| `number`  | رقم                                | قيمتا `min` و`max`       |
| `color`   | اسم لون من الثيم (`lime` و`cyan`…) | لون من الثيم أو لون CSS  |

تحتفظ الحقول غير المملوءة بقيمها الافتراضية، وهي متوفرة باللغتين. التزم بحدود الطول، فالنص الطويل هو السبب
الأكثر شيوعاً للتنبيه V-9 (تجاوز النص لصندوقه).

## مخططات المشاهد (blueprints)

الـ blueprints مشاهد مسمّاة ذات معاملات، تستخدمها الأداة `add_scene` (المستوى الثاني) والقوالب، وعددها 13:
`hook` و`problem-solution` و`stat-reveal` و`comparison` و`process-steps` و`timeline` و`before-after`
و`bar-stats` و`quote` و`cta` و`map-route` و`appointment` و`chat`. يحوّل كل منها بضعة حقول مسطحة إلى عناصر في مواضعها تدخل عند الكلمات المناسبة، وتعيد الأداة
`list_blueprints` حقولها.

## حلقات الأمثلة

لكل حزمة مثال بالعربية والإنجليزية في `packs/<pack>/examples/`. افتحه في المحرر أو صدّره دون تسجيل:

```bash
reelforge edit packs/healthcare/examples/first-visit-ar
reelforge render packs/healthcare/examples/first-visit-en --silent
```

## دروس حسب القطاع

يصنع كل [درس تطبيقي](tutorials/index.md) فيديو قصيراً بحزمة واحدة، مع النبرة وقواعد المحتوى الخاصة بذلك القطاع.

## أنشئ حزمتك الخاصة

الحزم ملفات عادية: ملف `pack.yaml` يُتحقق منه عند تحميله، وملف قالب لكل لغة فيه علامات `{{slot}}`. ويمكن لأي
مشروع إضافة حزمه في `<project>/packs/`، والحزمة التي تحمل معرّف حزمة مضمّنة تحل محلها. راجع
[المساهمة](contributing.md#add-an-industry-pack).

```yaml
# <project>/packs/clinic/pack.yaml
id: clinic
name: { en: My clinic, ar: عيادتي }
description: { en: Patient guides, ar: أدلة للمرضى }
theme: clinical
templates:
  - id: first-visit
    title: { en: First visit, ar: الزيارة الأولى }
    description: { en: What happens at a first visit, ar: ماذا يحدث في الزيارة الأولى }
    slots:
      org: { label: Clinic name, max: 26, default: { en: Lakeside Clinic, ar: عيادة ليكسايد } }
      wait: { label: Check-in minutes, type: number, min: 1, max: 120, default: 10 }
    files: { en: templates/first-visit.en.yaml, ar: templates/first-visit.ar.yaml }
```

أسهل طريقة لكتابة قالب هي نسخ حلقة جاهزة واستبدال الأجزاء المتغيرة:

- ضع حقول النص داخل نصوص YAML بعلامات اقتباس مفردة (`text: 'Welcome to {{org}}'`)، إذ تُهرَّب القيم (escape)
  تلقائياً. والأرقام دون علامات اقتباس (`value: {{wait}}`). و`{{id}}` هو معرّف الحلقة (`meta.id: '{{id}}'`).
- اربط الدخول بكلمات **ليست** حقولاً (`"l2:'bring'"`) أو ببداية السطر مع إزاحة (`l2+0.4`)، لأن قيمة الحقل قد لا
  تحتوي الكلمة التي رُبط بها الدخول.
- اجعل كل صندوق نص يتسع لأقصى طول للحقل، واجعل عنصراً ما يدخل أثناء نطق كل سطر من النص.
- جرّبه بـ `reelforge new test --pack <your-pack> --slot org=<اسم طويل>` ثم `reelforge validate test` باللغتين. ملفات
  القوالب مستثناة من Prettier لأنها ليست YAML صالحاً قبل ملئها.
