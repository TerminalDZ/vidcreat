# التكامل مع الذكاء الاصطناعي

يعمل ReelForge مستقلاً: تكتب النص، وتصمم المشاهد في المحرر، ثم تصدّر الفيديو. وإن استخدمت مساعد ذكاء
اصطناعي، فبإمكانه تولّي الجزء الأكبر من العمل: كتابة النص، وبناء كل مشهد، وفحص الإطارات المرسومة، وإصلاح
المشكلات. وتبقى
السيطرة لك: تسجّل صوتك بنفسك، وتراجع الـ cues بالسمع، وتعتمد النتيجة في المحرر.

لا يحتوي محرك الرسم على أي ذكاء اصطناعي، فهو يرسم كل إطار بشكل حتمي من `episode.yaml`. وتوجد أداتان
مساعدتان اختياريتان تعملان على جهازك:

- **محاذاة الكلام** (`align_cues` و`reelforge align`) تحدد بداية كل سطر وكل كلمة من `voice.wav`. وتعمل بكشف
  الوقفات وحده، وينزّل الأمر `reelforge align --setup` نماذج الكلام الاختيارية (Whisper وSilero VAD) مرة
  واحدة، لتعمل المحاذاة بعدها دون اتصال.
- **اقتراح المشاهد** (`suggest_scene` و`suggest_scenes`) يعتمد على قاموس كلمات مفتاحية مدمج، أو على نموذج لغوي
  تضبطه بنفسك (راجع [النماذج المحلية والسحابية](#models)).

## ثلاث طرق للاتصال

تقدّم الطرق الثلاث الأدوات نفسها من سجل واحد، فالأسماء والوسائط والنتائج متطابقة (ADR-014). يعرض
[مرجع أدوات MCP](../reference/mcp-tools.md) كل أداة.

| طريقة الاتصال       | التشغيل                        | نقطة الاتصال                   | مناسبة لـ                                          |
| ------------------- | ------------------------------ | ------------------------------ | -------------------------------------------------- |
| MCP عبر stdio       | يشغّل العميل `reelforge mcp`   | الإدخال والإخراج القياسيان     | Claude Code وCursor وVS Code وCodex وGemini CLI    |
| MCP Streamable HTTP | `reelforge studio` (أبقه يعمل) | `http://127.0.0.1:4310/mcp`    | العملاء الذين يفضّلون عنوان URL، أو عدة عملاء معاً |
| REST وOpenAPI       | `reelforge studio`             | `http://127.0.0.1:4310/api/v1` | أطر الوكلاء التي تدعم استدعاء الدوال               |

```bash
./reelforge mcp          # macOS / Linux
reelforge.cmd mcp        # Windows
```

لا تحتاج إلى تشغيل خادم stdio بنفسك، فالعميل يشغّله عند الحاجة. يعمل الخادم على جهازك ولا يرسل ملفاتك إلى
أي مكان، ولا ترى خدمة الذكاء الاصطناعي إلا ما يرسله العميل إليها.

تجيب واجهة REST على `GET /api/v1/tools` (أضف `?format=openai` للحصول على تعريفات دوال بصيغة OpenAI)، وعلى
`POST /api/v1/tools/<name>` مع الوسائط بصيغة JSON، وعلى `GET /api/v1/openapi.json` لـ GPT Actions وأي أداة
تستورد OpenAPI. وتوفّر لوحة التحكم أيضاً `/.well-known/mcp.json` (بطاقة الخادم) و`/llms.txt` و`/llms-full.txt`
(التوثيق في ملف واحد).

## إعداد العملاء

يحتوي مجلد المشروع مسبقاً على إعدادات Claude Code ‏(`.mcp.json`) وCursor ‏(`.cursor/mcp.json`) وVS Code
‏(`.vscode/mcp.json`) وGemini CLI ‏(`.gemini/settings.json`). افتح المجلد في العميل ووافق على الخادم
`reelforge`. فمثلاً مع Claude Code:

```bash
claude mcp add reelforge -- node packages/cli/bin/reelforge.js mcp
```

جرّب طلباً مثل: _«اصنع حلقة عربية مدتها 40 ثانية عن الـ database indexes، وعاين الإطارات، وأصلح أي مشكلة.»_

تجد بقية العملاء (Claude Desktop وWindsurf وCodex CLI وZed وContinue وLM Studio وأي إطار متوافق مع OpenAI)،
بنسختي stdio وHTTP، في صفحة [إعداد عملاء الذكاء الاصطناعي](../reference/ai-clients.md). وتعرض صفحة **Connect
AI** في لوحة التحكم (`/connect`) المقتطفات نفسها بمساراتك الحقيقية مع زر لاختبار الاتصال.

## مجموعات الأدوات (toolsets)

تعمل النماذج ذات نوافذ السياق الصغيرة بشكل أفضل مع عدد أقل من الأدوات. اطلب مجموعة أدوات واحدة أو أكثر:

```bash
reelforge mcp --toolsets basic,design
```

وعبر HTTP استخدم `/mcp?toolsets=basic` (ويعمل المعامل نفسه أيضاً مع `/api/v1/tools` و`/api/v1/openapi.json`).

| المجموعة | تحتوي على                                                                            |
| -------- | ------------------------------------------------------------------------------------ |
| `basic`  | القراءة، والإنشاء (من نص أو قالب)، وإضافة المشاهد، والتحقق، والمعاينة، والـ cues     |
| `design` | التعديلات المنظمة، وYAML الكامل، وschemas المكوّنات، والـ blueprints واقتراح المشاهد |
| `render` | التصدير، والحالة، والإلغاء، وفتح المحرر، وفحص البيئة                                 |
| `all`    | كل الأدوات (الافتراضي)                                                               |

## مستويات الأدوات (tiers)

اختر الأدوات المناسبة لقدرة النموذج. تُرجع كل أداة تكتب في الملفات ملخص التحقق، وتلميح إصلاح لكل مشكلة
(`fixes`)، والخطوة التالية الموصى بها (`next`)، فيستطيع أي نموذج أن يصحح نفسه عبر محاولات متتالية.

| المستوى | يناسب            | الأدوات                                                      | ما يكتبه النموذج                |
| ------- | ---------------- | ------------------------------------------------------------ | ------------------------------- |
| 1       | النماذج الصغيرة  | `list_templates` ← `create_from_template`، و`suggest_scenes` | كائن مسطح بقيم الحقول، دون YAML |
| 2       | النماذج المتوسطة | `create_episode`، و`list_blueprints` ← `add_scene`           | النص وبضعة حقول لكل مشهد        |
| 3       | النماذج القوية   | `edit_episode` و`write_episode_yaml` و`get_component_schema` | أي عنصر وخاصية وزمن وحركة       |

الأدوات المشتركة بين كل المستويات: `get_episode` و`validate_episode` و`preview_frames` (صور للنماذج التي تدعم
الرؤية، مع وصف نصي للتخطيط من أجل النماذج النصية) و`draft_cues` و`align_cues` و`set_cues` و`render_episode`
و`get_render_status` و`cancel_render` و`open_editor` و`doctor` و`get_guide`.

## الـ skills وملفات التعليمات

توجد أدلة المهام في `skills/` بصيغة Agent Skills (مجلد لكل skill فيه `SKILL.md` و`references/`). يحمّلها
العملاء الذين يدعمون الـ skills مباشرةً، أما غيرهم فيستدعون `get_guide` (مع `topic`، و`detail: true` للدليل
الكامل). ويجمع المجلد `.claude-plugin/` الـ skills مع خادم MCP في إضافة (plugin) لـ Claude Code.

| الـ skill                        | يغطي                                                                                       |
| -------------------------------- | ------------------------------------------------------------------------------------------ |
| `reelforge-make-video`           | سير العمل الكامل، وأي مستوى من الأدوات يُستخدم                                             |
| `reelforge-script-writing`       | الافتتاحيات (hooks)، وفكرة واحدة لكل سطر، والكلمات في الثانية، والمصطلحات داخل النص العربي |
| `reelforge-scene-design`         | التخطيط، والمناطق الآمنة، واختيار المكوّن، وقواعد الحركة                                   |
| `reelforge-timing`               | الـ cues، وربط الأزمنة بالكلمات، والمحاذاة التلقائية                                       |
| `reelforge-industry-playbooks`   | الجمهور والنبرة والقوالب وضوابط الامتثال لكل قطاع                                          |
| `reelforge-brand-and-themes`     | الثيمات من ألوان العلامة وخطوطها، والتباين                                                 |
| `reelforge-review-and-render`    | دورة التحقق والإصلاح، والمراجعة البصرية، وخيارات التصدير، والنشر                           |
| `reelforge-contribute-component` | إضافة مكوّن بالطريقة الصحيحة                                                               |

| ملف التعليمات                     | يقرأه                                                             |
| --------------------------------- | ----------------------------------------------------------------- |
| `AGENTS.md`                       | Codex وCursor وCopilot وWindsurf وZed وAider وJules ومعظم الوكلاء |
| `CLAUDE.md`                       | Claude Code (يستورد AGENTS.md)                                    |
| `GEMINI.md`                       | Gemini CLI (يستورد AGENTS.md)                                     |
| `.github/copilot-instructions.md` | GitHub Copilot                                                    |
| `.cursor/rules/reelforge.mdc`     | Cursor                                                            |
| `.windsurf/rules/reelforge.md`    | Windsurf                                                          |
| `llms.txt`                        | المساعدون الذين يبحثون عن فهرس llms.txt                           |

عدّل هذه الملفات لإضافة أسلوبك الخاص، مثل ألوان سلسلتك أو نبرة صوتك أو خاتمتك المعتادة.

## النماذج المحلية والسحابية {#models}

يمكن أن تستخدم اقتراحات المشاهد المدمجة في ReelForge نموذجاً لغوياً. لا يُضبط أي نموذج افتراضياً، ودون نموذج
تأتي الاقتراحات من قاموس الكلمات المفتاحية. اضبط متغيرات البيئة، أو اكتب `llm.json` في مجلد إعدادات ReelForge
(`%APPDATA%\reelforge` أو `~/Library/Application Support/reelforge` أو `~/.config/reelforge`) بالمفاتيح نفسها
(`provider` و`baseUrl` و`model` و`apiKey`).

| المتغير                  | المعنى                                                         |
| ------------------------ | -------------------------------------------------------------- |
| `REELFORGE_LLM_PROVIDER` | `openai` (أي خادم متوافق مع OpenAI) أو `anthropic` أو `ollama` |
| `REELFORGE_LLM_BASE_URL` | عنوان الخادم؛ ويُستنتج المزوّد منه عند عدم تحديده              |
| `REELFORGE_LLM_MODEL`    | اسم النموذج                                                    |
| `REELFORGE_LLM_API_KEY`  | مفتاح API للخدمات السحابية (يُحفظ في بيئتك أو ملفك فقط)        |

```bash
# Local model through Ollama (default address 127.0.0.1:11434)
REELFORGE_LLM_PROVIDER=ollama REELFORGE_LLM_MODEL=qwen2.5:1.5b reelforge studio

# LM Studio, llama.cpp server, vLLM or any OpenAI-compatible endpoint
REELFORGE_LLM_BASE_URL=http://127.0.0.1:1234/v1 REELFORGE_LLM_MODEL=my-model reelforge studio

# A cloud API
REELFORGE_LLM_PROVIDER=anthropic REELFORGE_LLM_API_KEY=... reelforge studio
```

على Windows PowerShell اضبط المتغيرات بالصيغة `$env:REELFORGE_LLM_MODEL = "qwen2.5:1.5b"` قبل تشغيل الأمر.
تُقيَّد الإجابات بـ schemas المكوّنات (مخرجات مقيّدة بـ JSON Schema حيث يدعمها الخادم، أو قواعد نحوية (grammar)
في Ollama، وإلا فدورة تحقق وإصلاح). وتعرض لوحة التحكم النموذج المستخدم.

## تقييم النماذج

يشغّل السكربت `scripts/eval-agents.mjs` مهمة تأليف واحدة لكل قطاع على نموذج ما عبر سجل الأدوات الحقيقي، ويقيّم
كل حلقة ناتجة: هل أُنشئت، وهل هي صالحة، وبلا تداخل، وداخل المناطق الآمنة، وباللغة الصحيحة، وهل تغطي كل الأسطر
(ومع `--render`: هل تُصدَّر).

```bash
pnpm build
node scripts/eval-agents.mjs --mock                                   # scripted model, offline (CI)
node scripts/eval-agents.mjs --base-url http://127.0.0.1:11434/v1 --model qwen2.5:7b
node scripts/eval-agents.mjs --base-url https://api.example.com/v1 --model my-model --api-key "$KEY" \
  --toolsets basic --tasks healthcare,finance --out results.md
```

يجب أن تدعم نقطة الاتصال واجهة Chat Completions المتوافقة مع OpenAI مع استدعاء الأدوات (tool calling). انشر النتائج بهذا الجدول
(يكتبه السكربت مع `--out`):

| Model | Toolsets | Industry | Lang | Score | Calls | Tool errors | Time (s) |
| ----- | -------- | -------- | ---- | ----- | ----- | ----------- | -------- |
|       | basic    | …        | ar   | %     |       |             |          |
|       | basic    | **all**  |      | **%** |       |             |          |

## الأمان {#security}

- ترتبط لوحة التحكم والمحرر بالعنوان `127.0.0.1`. يجب أن يحمل كل طلب ترويسة `Host` محلية (أو اسماً مدرجاً في
  `REELFORGE_ALLOWED_HOSTS`)، وهذا يمنع هجمات DNS rebinding. ولا تُرسَل ترويسات CORS، ولا تُقبل طلبات الكتابة إلا بصيغة JSON.
- يربط الأمر `reelforge studio --host <address>` (أو `REELFORGE_HOST`) الخادم بعنوان آخر. وعندها تشترط `/mcp`
  و`/api/v1` الترويسة `Authorization: Bearer <token>`، ولا تصل الأجهزة الأخرى إلا إلى نقاط الوصول الخاصة
  بالذكاء الاصطناعي، دون واجهة لوحة التحكم أبداً. ويفرض `REELFORGE_REQUIRE_TOKEN=1` الـ token على العنوان المحلي أيضاً.
- يُنشأ الـ token عند أول استخدام ويُحفظ في مجلد الإعدادات (ملف `token` لا يقرؤه غيرك حيث يدعم النظام ذلك).
  ولا تعرضه صفحة Connect AI إلا لمتصفح على الجهاز نفسه.
- ينقل بروتوكول HTTP العادي الـ token دون تشفير، لذا ضع لوحة التحكم على الشبكات غير الموثوقة خلف وسيط (proxy) يدعم TLS.
- لا تقرأ الأدوات ولا تكتب إلا داخل مجلد المشروع، ولا تُقدَّم ملفات التصدير إلا من `out/`.

يوثّق ADR-015 التصميم الكامل.

## نصائح

- **اطلب من المساعد أن ينظر.** قل: _«عاين الإطارات وأصلح أي شيء يبدو غير صحيح»_. يستقبل المساعد الإطارات
  كصور.
- **أبقِ الصوت بشرياً.** لا يولّد ReelForge أصواتاً أبداً. سجّل بنفسك، ودع `align_cues` يحدد الأسطر والكلمات،
  ثم استمع مرة واحدة في وضع **Cues** بالمحرر وأصلح أي سطر بالسمع.
- **راجع في المحرر.** اطلب `open_editor` للحصول على رابط. كل ما كتبه المساعد قابل للتعديل المرئي، ويمكن
  التراجع عن أي تغيير.
- **التغييرات الكبيرة:** يستطيع المساعد إعادة كتابة `episode.yaml` كاملاً. يُفحص الملف قبل حفظه، ويُرفض أي
  YAML غير صالح.
