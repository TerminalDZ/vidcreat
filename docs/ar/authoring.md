# كتابة الحلقات

كل ما يخص الحلقة موجود في `episodes/<id>/`:

```
episodes/ep10/
  episode.yaml   the spec (you write this)
  voice.wav      your recording (any sample rate, mono or stereo; other formats are converted with ffmpeg)
  cues.json      line and word start times (written by `reelforge align`, Cues mode or `reelforge cue --draft`)
  assets/        optional images/SVGs referenced as assets/<file>
  out/           generated: master, share, SRT, contact sheet, publish.md
```

## 1. الملف في لمحة

```yaml
meta:
  id: ep10 # slug
  series: 'SYSTEM DESIGN' # header text
  title: 'Idempotency'
  episode: 10
  preset: tiktok # tiktok | reels | shorts (presets/*.preset.yaml)
  theme: season1 # themes/<name>.theme.yaml, or a relative path
  lang: en-US # en-US (left to right) · ar-EG (right to left, English terms supported)
  publish: { cover: '…', caption: '…', hashtags: ['#systemdesign'], pinned: '…' }

audio:
  voice: voice.wav
  sfx: auto # auto | none | manual (only audio.extra and element sfx lists)
  sfx_gain_db: -16
  duck: true # duck SFX under the voice
  denoise: false # true removes background noise from the voice (phone recordings)
  extra: [{ at: "l9:'boom'", sound: hit, gain_db: -3 }]

script: # one spoken sentence per line; ids default to l1, l2, …
  - text: 'Ever paid online and your connection dropped?'
  - id: twice
    text: 'And you got charged twice.'
    break: ['twice'] # force a caption break before this word
    caption: auto # auto | none | "custom caption text"

chapters:
  - { at: l1, label: '01 · THE PROBLEM' }

scenes:
  - id: hook
    at: l1 # start; end defaults to the next scene's start
    glow: red # or a list: [{ at: l1, color: red }, { at: l3, color: lime }]
    transition: crossfade # crossfade | cut | slide-up | zoom | push | blur
    camera: still # still | drift | push-in | pull-out
    layout: stage # stage (between header and captions) | full (whole canvas)
    elements:
      - use: phone
        id: phone
        props: { title: 'Checkout', amount: '$49.00' }
        place: { x: 320, y: 30, w: 440, h: 880 }
        enter: { at: l1, anim: rise, dur: 0.6 }
        exit: { at: l3, anim: fade }
        states:
          - { at: "l1:'dropped'", set: { offline: true } }
        fx:
          - { at: "twice:'twice'", do: shake, amp: 22 }
          - { at: "twice:'twice'", do: flash, color: red }
```

يسرد [مرجع صيغة الحلقة](reference/episode-format.md) كل مفتاح مع نوعه وقيمته الافتراضية.

## 2. تعابير الزمن

| الصيغة                           | المعنى                                                        |
| -------------------------------- | ------------------------------------------------------------- |
| `12.5s` (أو رقم YAML مثل `12.5`) | ثوانٍ مطلقة                                                   |
| `l7`                             | بداية السطر `l7` بحسب الـ cue الخاص به                        |
| `l7.end`                         | بداية السطر التالي ناقص 0.15 ث                                |
| `l7:'timeout'`                   | أول كلمة تطابق "timeout" (مع تجاهل الترقيم والتطويل والتشكيل) |
| `l7:'request'#2`                 | المطابقة الثانية                                              |
| `l7:"Conway's"`                  | استخدم علامات الاقتباس المزدوجة إذا احتوت الكلمة على `'`      |
| `l7:'Duplicate Charge'`          | عبارة من عدة كلمات (زمن كلمتها الأولى)                        |
| `l7.3`                           | الكلمة الرابعة (العد من الصفر)                                |
| `@hook` و`@hook.end`             | بداية مشهد ونهايته                                            |
| أي مما سبق مع `+0.4` أو `-0.2`   | إزاحة بالثواني                                                |

تأتي أزمنة الكلمات من علاماتك اليدوية (وضع الكلمات في Cues) أو من المحاذاة التلقائية، أو تُقدَّر من عدد
الأحرف داخل السطر. ويُتحقَّق من صحة كل تعبير، وتقترح رسائل الخطأ أقرب بديل صالح. ونادراً ما تكتب هذه التعابير في
المحرر، فزر **target** والالتصاق على الخط الزمني يكتبانها لك.

وتعمل العربية بالطريقة نفسها: يرتبط `l7:'مرتين'` بكلمة عربية، وتُطابَق المصطلحات الإنجليزية داخل الجمل
العربية (`الـ client`) كما كُتبت.

## 3. وضع العناصر

إحداثيات المسرح: عرض 1080 وارتفاع 1000، ونقطة الأصل في الزاوية العليا اليسرى للمسرح (يبدأ المسرح عند y = 270
من الإطار في TikTok).

- صندوق صريح (أعداد صحيحة): `place: { x, y, w, h }`
- في المنتصف: `place: { center: true, w, h }`
- مثبّت إلى حافة أو إلى المركز: `place: { anchor: top|bottom|left|right|center, w, h, margin }`
- دون `place`: يوضع العنصر في المنتصف بحجمه الافتراضي، أو يرتّبه مساعد تخطيط في المشهد:
  - عناصر متجاورة أفقياً: `row: { gap, align, y, h }`
  - عناصر مكدّسة عمودياً: `column: { gap, align, x, w }`
  - مسارات متوازية في أعمدة: `columns: 2` (مع `gutter`، ومفتاح `col: 0|1` في العنصر)
- يغيّر `size: { w, h }` الحجم الافتراضي داخل المساعدات.
- يضع `layer: overlay` العنصر فوق غيره ويستثنيه من قاعدة التداخل (V-8).

أبعد المحتوى عن واجهة المنصة: يعرض المفتاح **Z** في المحرر المناطق الآمنة للـ preset. احتفظ بهامش جانبي قدره
60 px ‏(`x ≥ 60` و`x + w ≤ 1020`)، وفي الجزء السفلي من المسرح (y > 600) التزم بـ `x + w ≤ 920`، لأن شريط أزرار
TikTok يغطي الإطار بدءاً من x = 940. وفي المحرر يكفي أن تسحب العناصر وتغيّر حجمها، فهو يكتب `place` بنفسه.

## 4. الحركات

قيم `enter.anim`: ‏`pop` (الافتراضي) و`rise` و`slide-l` و`slide-r` و`fade` و`draw` و`type` و`count` و`flip`
و`zoom` و`glitch` و`stamp` و`blur` و`wipe` و`spring` و`drop` و`reveal` و`none`. والمعاملات: `dur` و`s0` و`dy`
و`dist` و`cps` و`caret` و`rot` و`amp` و`ease`.

| الدخول   | شكله                                                 | يناسب                                |
| -------- | ---------------------------------------------------- | ------------------------------------ |
| `pop`    | يكبر مع تجاوز بسيط ثم يستقر                          | الـ chips والأيقونات والأختام        |
| `rise`   | يظهر تدريجياً وهو يصعد (`dist`، الافتراضي 40 px)     | البطاقات والكود والمخططات            |
| `blur`   | يتضح تدريجياً من ضبابية خفيفة                        | العناوين الهادئة والاقتباسات         |
| `wipe`   | ينكشف من حافة البداية (الحافة اليمنى في العربية)     | الخطوط الزمنية والمقاييس والـ labels |
| `spring` | يكبر ثم يستقر باهتزاز نابضي                          | التنبيهات المرحة                     |
| `drop`   | يسقط من الأعلى ويرتد حتى يستقر                       | الشارات وعُقد «النتيجة»              |
| `reveal` | ينزلق صاعداً من قناع غير مرئي، كبطاقة عنوان (`dist`) | العناوين الكبيرة                     |
| `type`   | يُكتب حرفاً حرفاً (`cps`)                            | الكود ونصوص الطرفية                  |

يغيّر `enter.ease` طريقة تسارع الحركة: `smooth` (الافتراضي، تباطؤ في النهاية)، أو `snappy` (بداية سريعة واستقرار
طويل)، أو `gentle` (تسارع وتباطؤ)، أو `linear`. ويحتفظ `pop` و`spring` بارتدادهما الخاص.

قيم `exit.anim`: ‏`fade` و`pop` و`rise` و`sink` و`slide-l` و`slide-r` و`zoom` و`blur` و`wipe` و`none`.

يحدد مفتاح `transition` في المشهد كيف يحل المشهد محل سابقه: `crossfade` (الافتراضي)، و`cut`، و`slide-up`،
و`zoom` (تكبير يعبر إلى المشهد الجديد)، و`push` (يدفع المشهد السابق جانباً)، و`blur` (ذوبان ناعم). ويضيف
مفتاح `camera` حركة واحدة بطيئة ومستمرة على امتداد المشهد: `drift` أو `push-in` (تكبير بطيء) أو `pull-out`.
وتتباطأ هذه الحركات في بدايتها ونهايتها، فلا تبدو مفاجئة أبداً.

تُرسم كل الحركات بدقة تقل عن البكسل الواحد (sub-pixel)، فتبقى الحركات البطيئة ناعمة بدل أن تتقدم بكسلاً
بكسلاً. وفي المحرر يشغّل الزر **Preview animation** في لوحة الخصائص (وكذلك اختيار حركة أو منحنى تسارع أو
انتقال جديد) تلك اللحظة وحدها مرة واحدة.

قيم `fx[].do`: ‏`shake` (مع `target: camera` يهتز المسرح كله)، و`flash` (وميض لوني يملأ الإطار)، و`glitch`،
و`pulse` (‏`rate`)، و`bump`. يضيف الوميض صوت `hit` والتشويش صوت `glitch` ما لم تضع `sound: none`.

الحالات: `states: [{ at, set: { … } }]`، ويوثّق كل مكوّن المفاتيح التي يستجيب لها (مثل `node.status`
و`phone.offline` و`chip.strike` و`grid.tiles`). راجع [مرجع المكوّنات](reference/components.md).

## 5. المؤثرات الصوتية

مع `audio.sfx: auto` تشغّل المكوّنات أصواتها الافتراضية (العنوان ← whoosh، والختم ← hit، وصف الجدول ← ding،
وخطوة المسار ← tick…). أوقفها لعنصر بعينه بـ `sfx: none`، أو أعطه قائمة `sfx: [{ at: l4, sound: ding }]`.
الأصوات المتاحة: `whoosh hit ding err glitch tick tap typing`. وتُدمج أحداث الصوت الواحد إذا كان الفاصل بينها أقل من 80 ms.

## 6. الثيمات والـ presets

تحتوي الثيمات (`themes/*.theme.yaml`) على كل الألوان والخطوط والأحجام وإعدادات الحركة، ويمكن أن ترث ثيماً آخر
بـ `extends:`. يتحكم `chrome.grain_fps` (الافتراضي 0، أي نسيج ثابت) في عدد مرات تغيّر حبيبات الفيلم، علماً أن
الحبيبات المتحركة تزيد حجم الملف أضعافاً (راجع ADR-011). وتحتوي الـ presets (`presets/*.preset.yaml`) على
أبعاد الإطار، ومواضع الترويسة والمسرح والترجمة النصية، ومستطيلات المناطق الآمنة، وحجم ملف النشر، وأقصى مدة، ويمكن تعديلها دون لمس الكود.
راجع [الثيمات والهوية](guide/themes.md).

## 7. قواعد التحقق

| القاعدة | المستوى | المعنى                                                  |
| ------- | ------- | ------------------------------------------------------- |
| V-1     | error   | مخالفة الـ schema (مع اقتراح did-you-mean)              |
| V-2     | error   | تعبير زمن لا يمكن حسابه                                 |
| V-3     | error   | الـ cues ناقصة أو خارجة عن الترتيب                      |
| V-4     | warn    | تغيّر الصوت منذ تحديد الـ cues، أو غياب الصوت           |
| V-5     | error   | خروج قبل الدخول، أو دخول خارج المشهد                    |
| V-6     | warn    | صندوق العنصر خارج المسرح أو الإطار                      |
| V-7     | warn    | عنصر داخل منطقة واجهة المنصة                            |
| V-8     | warn    | تداخل عنصرين ظاهرين من طبقة `base` بأكثر من 15%         |
| V-9     | warn    | النص يتجاوز صندوقه (يُقاس في متصفح دون واجهة)           |
| V-10    | warn    | الترجمة النصية تمتد على أسطر أكثر من `max_lines`        |
| V-11    | info    | لا شيء يدخل في أول 1.5 ث من المشهد                      |
| V-12    | warn    | عنصر يدخل قبل نهاية مشهده بأقل من 0.1 ث                 |
| V-13    | error   | مكوّن أو خط غير معروف                                   |
| V-14    | warn    | سطر يُنطق بأكثر من 3.5 كلمة/ث، أو افتتاحية تبدأ بعد 3 ث |
| V-14    | info    | صمت مدته 1.5 ث أو أكثر في التسجيل                       |

مع الخيار `--strict` يفشل الأمر `reelforge validate <id>` عند وجود تحذيرات أيضاً (استخدمه في CI).
