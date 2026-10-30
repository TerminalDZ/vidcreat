# درس التقنية والبرمجيات

في هذا الدرس تصنع فيديو موضوعه: شرح الـ rate limiting بخوارزمية token bucket لمطوري الـ backend. ستستخدم الحزمة `tech` وثيمها `default`، ويستغرق العمل نحو عشر
دقائق قبل التسجيل.

## 1. أنشئ الحلقة

```bash
reelforge new rate-limiting --pack tech --template system-concept --lang ar
```

استخدم `--lang en` لنسخة إنجليزية. وتضم الحزمة أيضاً القالبين `latency-numbers` و`request-path`. يعرض [فهرس الحزم](../../reference/packs.md#tech) كل القوالب
وحقولها.

## 2. أدخل بياناتك

افتح الحلقة بالأمر `reelforge edit rate-limiting` واستبدل الأسماء والأرقام والكلمة المفتاحية الافتراضية
ببياناتك، أو ابدأ من لوحة التحكم (**+ New episode** ثم **Start from template**)، فيطلب النموذج كل حقل على حدة. التزم بحدود
الطول الظاهرة لكل حقل.

**الجمهور والنبرة.** المطورون والطلاب والمؤسسون التقنيون. كن دقيقاً وملموساً وخفيف الظل قليلاً.

- استخدم `node` و`arrow` مع حزم بيانات متحركة لمسار الطلب، و`bucket` للمحدِّد.
- اجعل كل عنصر يدخل عند نطق الكلمة التي تسميه: «bucket» و«token» و«429».
- حلقات `examples/season1-arabic` تعرض مشاهد كاملة بهذا الأسلوب.

## 3. راجع المحتوى

- الكود يجب أن يكون صحيحاً وقابلاً للتشغيل كما هو، وبحد أقصى 8 أسطر لكل عنصر `code`.
- لا شعارات شركات أو منتجات حقيقية؛ صِف التقنيات بشكل عام.
- في مواضيع الأمان: اشرح طرق الحماية لا الثغرات العاملة، واستخدم `example.com`.

## 4. تحقق وسجّل وصدّر

```bash
reelforge validate rate-limiting
reelforge align rate-limiting          # after you save voice.wav in the episode folder
reelforge render rate-limiting
```

يوجد مثال مكتمل في `packs/tech/examples/rate-limiting-ar`؛ صدّره مع الخيار `--silent` للمقارنة.
