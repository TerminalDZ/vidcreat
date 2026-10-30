# المساهمة

نرحب بالمساهمات بموجب ترخيص Apache License 2.0 (وبموجب CC BY 4.0 للتوثيق والأمثلة). يشرح الملف
[`CONTRIBUTING.md`](../../../CONTRIBUTING.md) في المستودع إعداد بيئة التطوير على Windows وmacOS وLinux، وقواعد
رسائل الـ commits، وبوابة الجودة التي يجب أن يجتازها كل pull request:

```bash
pnpm build && pnpm typecheck && pnpm lint && pnpm test:unit && pnpm test:browser
```

تصف هذه الصفحة أكثر أربعة أنواع من المساهمات شيوعاً.

## إضافة مكوّن {#add-a-component}

1. أضف schema خصائصه وقيمها الافتراضية في `packages/core/src/components/`. الخصائص كائنات Zod صارمة؛ أعطِ كل
   خاصية قيمة افتراضية مناسبة حتى يستطيع المحرر إدراج المكوّن دون أي مدخلات.
2. أضف تنفيذه في الـ runtime ضمن `packages/runtime/src/components/`. يرسم المكوّن عناصر DOM وSVG لأي زمن `t`، ويجب أن يبقى
   نقياً: لا `Date.now()`، ولا عشوائية دون بذرة، ولا مؤقتات. وادعم التخطيط من اليمين إلى اليسار.
3. أضف مشهداً يعرضه إلى المعرض في `fixtures/golden/components/episode.yaml`.
4. حدّث الإطارات المرجعية (golden frames) وراجع كل صورة تغيّرت:
   `UPDATE_GOLDEN=1 pnpm test:browser` (وفي PowerShell:
   `$env:UPDATE_GOLDEN=1; pnpm test:browser; Remove-Item Env:UPDATE_GOLDEN`).
5. أعد توليد التوثيق بالأمر `pnpm docs:gen`، فيلتقط [مرجع المكوّنات](../reference/components.md) الـ schema
   وصورة المعرض الجديدة.

ويضم الـ skill المسمى `reelforge-contribute-component` قائمة تحقق مفصلة.

## إضافة ثيم {#add-a-theme}

انسخ `themes/default.theme.yaml` إلى `themes/<name>.theme.yaml` وغيّر القيم، أو ولّد ثيماً بالأمر
`pnpm reelforge theme new <name> --accent "#hex"`. استخدم الخطوط المضمّنة فقط والتزم بقواعد التباين في
[الثيمات والهوية](themes.md)، فاختبار الثيمات يفحص معيار WCAG AA لكل ثيم مضمّن. جرّبه على حلقة من
الأمثلة (`meta.theme: <name>`) باستخدام الأمر `reelforge snap`. ولا تحتوي الثيمات على أي كود.

## إضافة حزمة قطاعية {#add-an-industry-pack}

توجد الحزمة في `packs/<id>/`:

```text
packs/<id>/
  pack.yaml                     manifest: names, description, theme, blueprints, templates and slots
  templates/<template>.en.yaml  an episode with {{slot}} placeholders (one file per language)
  templates/<template>.ar.yaml
  examples/<name>-en/           a complete example episode (generated)
  examples/<name>-ar/
```

1. افتح أولاً [طلب حزمة قطاعية](https://github.com/TerminalDZ/vidcreat/issues/new?template=industry_pack_request.yml)
   للاتفاق على النطاق.
2. اكتب `pack.yaml`؛ يتحقق منه schema الحزم في `packages/core/src/packs.ts` عند تحميله. استخدم أسماء جهات
   خيالية فقط، واجعل حدود الحقول ضيقة بما يكفي ليتسع النص في صندوقه.
3. اكتب كل قالب بالإنجليزية والعربية، بحيث يدخل كل عنصر عند كلمة من النص.
4. أضف المثال إلى `scripts/gen-pack-examples.mjs` وشغّله، ثم تحقق من الأمثلة وصدّرها مع الخيار `--silent`.
5. أضف دليل القطاع في `skills/reelforge-industry-playbooks/references/<id>.md` (الجمهور، والنبرة، والحلقات
   المعتادة، وضوابط الامتثال)، ثم شغّل `pnpm docs:gen` لتحديث [فهرس الحزم](../reference/packs.md).

## إضافة skill {#add-a-skill}

توجد الـ skills في `skills/<name>/SKILL.md` بصيغة Agent Skills: مقدمة YAML (front matter) فيها `name` ووصف `description` من
جملة واحدة يحدد متى يُستخدم الـ skill، تليها تعليمات Markdown موجزة، وتوضع المواد الأطول في `references/`.
اجعل كل skill مركّزاً على مهمة واحدة، ولا تُشِر إلا إلى أوامر وملفات موجودة، واختبره باتباع تعليماته بنفسك على
حلقة جديدة. يفحص الأمر `pnpm check:skills` (ضمن `pnpm lint`) الصيغة، وتقدّم الأداة `get_guide` الـ skill
الجديد تلقائياً.

## التوثيق {#documentation}

يُبنى الموقع والتوثيق الذي يعمل دون اتصال من ملفات Markdown نفسها في `docs/`:

| الأمر             | وظيفته                                                                                                  |
| ----------------- | ------------------------------------------------------------------------------------------------------- |
| `pnpm docs:gen`   | يعيد توليد الصفحات المرجعية وصور المكوّنات و`docs/components.md` و`llms-full.txt`                       |
| `pnpm docs:dev`   | يشغّل الموقع محلياً مع إعادة التحميل التلقائي                                                           |
| `pnpm docs:site`  | يبني الموقع العام (بالمسار الأساسي `/vidcreat/`) في `docs/.site` (ويفشل عند وجود روابط معطلة)           |
| `pnpm docs:local` | يبني الموقع نفسه بالمسار الأساسي `/docs/` في `documentation/site`، وتقدّمه لوحة التحكم على `/docs/`     |
| `pnpm docs`       | يشغّل `docs:gen` ثم يبني الملف الواحد `documentation/index.html` (بالإنجليزية والعربية) ثم `docs:local` |

توجد الصفحات الإنجليزية في `docs/guide/` و`docs/reference/`، وتقابلها نسخها العربية في `docs/ar/`. لا تعدّل الصفحات
المولّدة يدوياً أبداً: يشغّل CI الأمر `node scripts/check-docs-fresh.mjs` ويفشل إذا لم تكن محدّثة. وفي الصفحات
العربية أبقِ المصطلحات التقنية والأوامر ومفاتيح YAML بالإنجليزية بين علامتي backtick، وتجنب بدء الفقرة
بكلمة لاتينية.

## سجلات القرارات {#decision-records}

لأي تغيير تصميمي كبير، أضف سجل قرار (ADR) في `docs/adr/` (بالرقم التالي، مع السياق والقرار والعواقب).
