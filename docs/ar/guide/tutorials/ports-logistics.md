# درس الموانئ والخدمات اللوجستية

في هذا الدرس تصنع فيديو موضوعه: رحلة حاوية من السفينة إلى الشاحنة في ميناء خيالي. ستستخدم الحزمة `ports-logistics` وثيمها `harbor`، ويستغرق العمل نحو عشر
دقائق قبل التسجيل.

## 1. أنشئ الحلقة

```bash
reelforge new container-journey --pack ports-logistics --template container-journey --lang ar
```

استخدم `--lang en` لنسخة إنجليزية. وتضم الحزمة أيضاً القالبين `terminal-in-numbers` و`new-route`. يعرض [فهرس الحزم](../../reference/packs.md#ports-logistics) كل القوالب
وحقولها.

## 2. أدخل بياناتك

افتح الحلقة بالأمر `reelforge edit container-journey` واستبدل الأسماء والأرقام والكلمة المفتاحية الافتراضية
ببياناتك، أو ابدأ من لوحة التحكم (**+ New episode** ثم **Start from template**)، فيطلب النموذج كل حقل على حدة. التزم بحدود
الطول الظاهرة لكل حقل.

**الجمهور والنبرة.** المستوردون والمصدّرون ووكلاء الشحن والسائقون وموظفو الموانئ. كن دقيقاً وعملياً، فالأرقام هنا مهمة.

- اعرض المراحل بمكوّن `flow` مع مؤشر متحرك (token)، مرحلة لكل خطوة منطوقة.
- أبقِ المصطلحات الإنجليزية داخل الجملة العربية (`الـ container` و`الـ customs`).
- ضع وسم «مثال» على الأزمنة والكميات ما لم يقدّم العميل أرقاماً حقيقية.

## 3. راجع المحتوى

- لا موانئ ولا شركات شحن ولا سفن ولا مشغّلي محطات حقيقيين.
- قواعد الجمارك تختلف من بلد لآخر: قدّمها كأمثلة وأحِل المشاهدين إلى الجهة المحلية المختصة.
- لا تفاصيل أمنية مثل إجراءات البوابات أو التفتيش.

## 4. تحقق وسجّل وصدّر

```bash
reelforge validate container-journey
reelforge align container-journey          # after you save voice.wav in the episode folder
reelforge render container-journey
```

يوجد مثال مكتمل في `packs/ports-logistics/examples/azur-container-ar`؛ صدّره مع الخيار `--silent` للمقارنة.
