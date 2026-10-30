# الثيمات والهوية البصرية

تبدو السلسلة متناسقة حين تكون ألوانها وخطوطها وحركتها في ثيم واحد بدلاً من تكرارها في كل عنصر. تشرح هذه
الصفحة الثيمات والخطوط وقواعد التباين عند تطبيق هوية علامة تجارية، ثم الـ presets الخاصة بالمنصات.

## الثيمات

يحتوي الثيم (`themes/<name>.theme.yaml`) على كل الألوان وأحجام الخطوط وإعدادات الحركة، وتختار الحلقة ثيمها
بالمفتاح `meta.theme`. ويمكن للثيم أن يرث ثيماً آخر عبر `extends:` ويغيّر ما يلزم فقط:

```yaml
name: myseries
extends: default
colors:
  lime: '#3cc8ff' # the accent color (titles, active caption word)
  bg: '#070c0e'
chrome: { grain: 0.05, waveform: true }
captions: { active: lime, english: cyan, max_chars: 34 }
```

| المجموعة   | المفاتيح                                                                                                                                    |
| ---------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| `mode`     | `dark` (الافتراضي) أو `light`. تحصل الثيمات الفاتحة على خطوط فاصلة رفيعة داكنة وظلال ناعمة وأسطح فاتحة للمكوّنات (الهاتف وtrap والـ labels) |
| `colors`   | `bg ink dim line card lime cyan red amber violet` (ويمكنك إضافة أسماء خاصة بك)                                                              |
| `fonts`    | `display` ‏(Space Grotesk) و`mono` ‏(JetBrains Mono) و`arabic` ‏(Cairo)؛ ويمكن استخدام أي خط مضمّن (انظر أدناه)                             |
| `type`     | أحجام الخطوط: `caption title h2 body label`                                                                                                 |
| `chrome`   | `header progress waveform grid` (تشغيل/إيقاف)، و`grain` ‏(0–1)، و`grain_fps` ‏(0 = ثابت)، و`vignette` ‏(0–1)، و`glow` ‏(0–1، الافتراضي 1)   |
| `motion`   | `pop_overshoot default_dur crossfade`                                                                                                       |
| `captions` | ألوان `active english`، و`future_opacity`، و`max_lines`، و`max_chars`، و`scrim`                                                             |

لألوان الثيم معانٍ: `lime` هو لون التمييز الأساسي ويعني «سليم»، و`red` للأخطاء، و`amber` للتحذيرات، و`cyan`
للمعلومات. حافظ على كل لون ضمن عائلته عند تغيير الهوية.

### الثيمات المضمّنة

| الثيم        | الوضع | الاستخدام                   | الخطوط (`display` · `arabic`)        |
| ------------ | ----- | --------------------------- | ------------------------------------ |
| `default`    | داكن  | الشروحات التقنية (Season 1) | Space Grotesk · Cairo                |
| `season1`    | داكن  | مثل `default`               | Space Grotesk · Cairo                |
| `workshop`   | داكن  | الدورات                     | Space Grotesk · Cairo                |
| `clinical`   | فاتح  | الرعاية الصحية              | Inter · Readex Pro                   |
| `estate`     | فاتح  | العقارات                    | Playfair Display · Noto Naskh Arabic |
| `campus`     | فاتح  | التعليم                     | Manrope · Readex Pro                 |
| `civic`      | فاتح  | الخدمات العامة              | Inter · Noto Kufi Arabic             |
| `minimal`    | فاتح  | أي محتوى، بأسلوب هادئ       | Inter · Readex Pro                   |
| `harbor`     | داكن  | الموانئ والخدمات اللوجستية  | Manrope · Noto Kufi Arabic           |
| `ledger`     | داكن  | المالية                     | Inter · Noto Kufi Arabic             |
| `bistro`     | داكن  | المطاعم والأطعمة            | Playfair Display · Noto Naskh Arabic |
| `retail`     | داكن  | المتاجر والعروض             | Manrope · Cairo                      |
| `industrial` | داكن  | التصنيع والهندسة            | Space Grotesk · Noto Kufi Arabic     |
| `voyage`     | داكن  | السياحة والسفر              | Manrope · Readex Pro                 |
| `editorial`  | داكن  | الأخبار                     | Playfair Display · Noto Naskh Arabic |
| `bold`       | داكن  | الترويج على منصات التواصل   | Manrope · Cairo                      |

تجتاز كل الثيمات المضمّنة معيار WCAG AA: تصل ألوان `ink` و`dim` وألوان التمييز الخمسة ولونا الترجمة النصية إلى تباين
4.5:1 على الأقل فوق `bg` وفوق `card`، وتصل ألوان الترجمة إلى 7:1 فوق الخلفية
(`packages/core/test/themes.test.ts`).

### الخطوط

كل الخطوط مضمّنة مع محرك الرسم (برخصة SIL Open Font License 1.1، ولا اتصال بالشبكة أثناء التصدير). ويجب أن
تختار في المفتاح `fonts` أحدها (القاعدة V-13):

| الخانة    | العائلات                                                                    |
| --------- | --------------------------------------------------------------------------- |
| `display` | Space Grotesk وInter وManrope وPlayfair Display (serif)                     |
| `mono`    | JetBrains Mono                                                              |
| `arabic`  | Cairo وNoto Kufi Arabic وNoto Naskh Arabic (نسخ) وReadex Pro (لاتيني وعربي) |

تستخدم الترجمة النصية خط `arabic` أولاً، لذا اختر خطاً تناسب حروفه اللاتينية الترجمة الإنجليزية أيضاً.

### توليد ثيم

```bash
reelforge theme new myseries --accent "#3cc8ff"
reelforge theme new clinic --accent "#00a884" --mode light --font "Noto Kufi Arabic"
```

| الخيار           | المعنى                                                                             |
| ---------------- | ---------------------------------------------------------------------------------- |
| `--accent <hex>` | لون التمييز الأساسي (`lime`)؛ يبقى كما هو إذا كان مقروءاً، وإلا تُعدَّل درجة سطوعه |
| `--mode <mode>`  | `dark` (الافتراضي) أو `light`                                                      |
| `--font <name>`  | عائلة مضمّنة توضع في خانتها (display أو mono أو arabic)                            |
| `--out <file>`   | الكتابة في مكان غير `themes/<name>.theme.yaml`                                     |

يكتب المولّد كل مفاتيح الألوان ويفحص قواعد WCAG AA نفسها التي تجتازها الثيمات المضمّنة.

وينبّه ReelForge إذا قلّ تباين أحد ألوان الترجمة النصية عن 7:1 أمام الخلفية.

## هوية السلسلة

1. ولّد ثيماً من اللون الأساسي للعلامة: `reelforge theme new acme --accent "#2f7dff"`.
2. وزّع ألوان العلامة على المفاتيح: `lime` هو لون التمييز (الكلمات المميزة في العناوين والكلمة النشطة في
   الترجمة النصية)، و`cyan` لون التمييز الثانوي، أما `bg` و`card` و`line` و`ink` و`dim` فهي الألوان المحايدة.
3. إن لم يكن خط العلامة مضمّناً فاختر أقرب عائلة مضمّنة. خطوط النظام وخطوط الويب غير مسموحة، لأن نتيجة
   التصدير يجب ألا تعتمد على الجهاز.
4. ضع `meta.theme: acme` في كل حلقات السلسلة، ثم تحقق من الحلقات وعاين الإطارات مع لون التوهج الخاص بكل مشهد.

| النص                                                                    | أدنى تباين أمام خلفيته              |
| ----------------------------------------------------------------------- | ----------------------------------- |
| النص العادي والـ labels والـ chips                                      | 4.5:1                               |
| النص الكبير: العناوين والعدّادات (≥ 24 px، أو ≥ 18.66 px عريض)          | 3:1                                 |
| الترجمة النصية (`ink` و`captions.active` و`captions.english` أمام `bg`) | 7:1 (وينبّه ReelForge إذا قلّ عنها) |

افحص نص التمييز فوق `bg` **وفوق** `card`، لأن الـ chips والعُقد تقع فوق البطاقات. ولا تعتمد على اللون وحده
لإيصال المعنى: أرفق الأحمر والأخضر بأيقونة أو `label` أو خط شطب. وتأتي كل حزمة قطاعية بثيم مناسب لقطاعها (راجع
[القوالب والحزم](templates-and-packs.md)).

## الـ presets الخاصة بالمنصات

تحدد الملفات `presets/tiktok.preset.yaml` و`reels.preset.yaml` و`shorts.preset.yaml` مواضع الترويسة والمسرح
والترجمة النصية، ومستطيلات المناطق الآمنة، وحجم ملف النشر الافتراضي، وأقصى مدة. عدّلها كما تشاء أو أضف ملفاتك
(`presets/<name>.preset.yaml`)، ثم اخترها بالمفتاح `meta.preset` أو بالخيار `--preset` عند التصدير.
