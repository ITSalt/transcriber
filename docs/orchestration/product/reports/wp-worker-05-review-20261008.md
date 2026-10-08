# Сверка — WP-WORKER-05 (PR https://github.com/ITSalt/transcriber/pull/26, `4267b4bb57` -> `main @ 0f14bc7de3`) — 2026-10-08

Раунд 1. Дифф: 6 files changed, 198 insertions(+), 21 deletions(-) (файлов: 6).

**Решение: `REVISE WP-WORKER-05`** — всё по объёму реализовано и покрыто (CI pass, worker 425 passed, мутации M1–M5/M7/M8 убиты), но связка env → фабрика → тело запроса не покрыта тестом: мутации M6/M6b (фабрика не передаёт `maxTokens`/`reasoning` в конструктор) выживают при 111/111 зелёных — а именно эта связка и есть цель пакета (критерий 2). Один тест — и приёмка.

## Пункты REVISE

1. `worker/src/llm/provider.ts:99-109` (`openRouterProvider`) → правка, при которой фабрика перестаёт передавать `reasoning` и/или `maxTokens`, оставляет `LLM_REASONING=low` / `LLM_MAX_TOKENS=16000` в проде молча проигнорированными при зелёных тестах (M6, M6b выжили) → требование: тест в `worker/src/llm/provider.test.ts` — `createLlmProvider({ OPENROUTER_API_KEY, LLM_REASONING: 'low', LLM_MAX_TOKENS: '12000' })` с подменённым `fetch` (`vi.stubGlobal`) → в теле запроса `reasoning: {effort:'low'}` и `max_tokens: 12000`; то же для `createCompletionProvider` (с `complete()` без `maxTokens`). Серьёзность: Medium (цель пакета без страховки).

### Не требуется

- Не переделывать логгер адаптера (Low-1) и не добавлять обработку обрезанного ответа (Low-2) — backlog.
- Не менять `.env.example` сверх сделанного.

## Вопросы владельцу

нет

## Принято как есть / backlog

- Low-1: модульный pino в `provider.ts` без redact/pretty (в dev — сырой JSON среди pretty-вывода); backlog: передавать логгер из `protocol-generation.ts`/`memory/index.ts`.
- Low-2: `finish_reason: length` с непустым текстом возвращается как успех (обрезанный протокол), как на базе; теперь видно в логе; backlog: warn или постоянная ошибка.
- Info: `.env.example` не говорит, что невалидные `LLM_REASONING`/`LLM_MAX_TOKENS` останавливают воркер; литерал 8192 в `describeLlmSettings`; `reasoning` + `response_format` в одном теле не утверждается тестом (проверит живой шаг памяти MEMORY_EXTRACT после доставки).
- Отклонения PR приняты: отдельный pino (цикл logger↔provider реален), паритет без равенства `max_tokens`, `.env.example` (A-13), D-17.
- graph: checked — узлы спецификации не меняются (поле «Граф: нет»).

## Автоматические находки

- **пути и замки**: WP-WORKER-05: shared path .env.example changed without the lock

Дифф ревизии (пересдачи): —

---

## Отчёт рецензента (дословно)

# Отчёт рецензента — WP-WORKER-05, PR #26 (`4267b4bb57` → `main @ 0f14bc7de3`)

## 1. Вердикт: **ACCEPT with condition**

Все пять пунктов объёма реализованы там, где заявлено, и соответствуют коду (`worker/src/llm/openrouter.ts`, `worker/src/llm/provider.ts`, `worker/src/config.ts`, `.env.example`); kie.ai-файлы, промпты и `pipeline.ts` не тронуты (diff пустой). CI `pass`, в одноразовом клоне `pnpm --filter @transcrib/worker test` 425 passed / 8 skipped, `pnpm -r typecheck` зелёный, lint 0 ошибок. Мутации M1–M5, M7, M8 убиты. Условие: мутации M6/M6b (фабрика `openRouterProvider` в `provider.ts` перестаёт передавать `maxTokens` / `reasoning` в конструктор) **выживают** — нет теста, который проверяет, что значения из env доходят до тела запроса. Поведение по коду верное (`provider.ts:105-106`), но единственная связка «env → запрос», ради которой пакет делался, не покрыта; требуется один тест фабрики с подменённым `fetch` (разрешённый путь `worker/src/llm/provider.test.ts`). Ничего, что работало на базе, не исчезло.

## 2. Объём и критерии приёмки → код → статус (head `4267b4bb574a4d709199d788a8747c808edf70b1`)

| Пункт | Где | Статус |
|---|---|---|
| Объём 1: `reasoning` в теле — `{enabled:false}` при `off`, `{effort}` иначе; опция конструктора `reasoning` | `worker/src/llm/openrouter.ts:48` (тип), `:101`, `:117` (default `'off'`), `:157` (тело) | Сделано; тест `openrouter.test.ts:213-223` (M1, M2 убиты) |
| Объём 2: `LLM_MAX_TOKENS` ≥ 256, default 8192; `generate()` = опция, `complete()` = `input.maxTokens ?? опция`; kie.ai 4096 не менять | `openrouter.ts:46`, `:118`, `:127`, `:138`; `config.ts:22`; `kieai.ts:174` и `memory/kieai-completion.ts:56` без изменений | Сделано; тесты `openrouter.test.ts:225-240` (M3 убита) |
| Объём 3: пустой `content` + `finish_reason==='length'` → постоянная ошибка с `reasoning_tokens`/`completion_tokens`; прочие пустые — прежний текст + `finish_reason`; `tokensOut` = `completion_tokens`; `reasoning_tokens` в info-лог | `openrouter.ts:209-230` (ошибка), `:212-218` (лог), `:236` (`tokensOut`) | Сделано; тесты `openrouter.test.ts:242-269` (M4, M5 убиты) |
| Объём 4: `config.ts` enum/число; `provider.ts` прокидывает; стартовая строка `reasoning: off max_tokens: 8192`; `.env.example` | `config.ts:19-22`; `provider.ts:29-30,74-75,87-94,99-109`; `.env.example:75-85` | Сделано; `provider.test.ts:55-68,90-114` (M7, M8 убиты). **Прокидывание в конструктор не покрыто** (M6, M6b выжили) |
| Объём 5: не менять kie.ai, промпты, остальную классификацию, прокси | `git diff --stat 0f14bc7de3 4267b4b` — только 6 файлов, `kieai.ts`/`kieai-completion.ts`/`pipeline.ts`/`kieai.test.ts`/`prompts/**`/`lib/outbound-proxy.ts` отсутствуют в диффе | Соблюдено |
| КП 1: тесты адаптера с подменённым `fetch` | `openrouter.test.ts:204-270` | Выполнен |
| КП 2: тесты фабрики/конфига: дефолты, невалидные → ошибка на старте, стартовая строка | `provider.test.ts:90-114` | Выполнен буквально; см. условие (M6) |
| КП 3: typecheck, тесты зелёные; `kieai.test.ts` без изменений | клон: оба exit 0; `git diff --stat … -- worker/src/llm/kieai.test.ts` пуст | Выполнен |
| КП 4: таблица переменных и влияние на стоимость/время в PR | тело PR, раздел «Переменные» | Выполнен |

## 3. Ответы на вопросы риска

**В1. Отдельный pino-инстанс в `provider.ts:96`.** Создаётся на уровне модуля при импорте `provider.ts`. Пишет в stdout асинхронно (pino 10.3.1, `lib/tools.js:366`: `buildSafeSonicBoom({ fd: process.stdout.fd || 1 })` без `sync`), без `redact`, без `pino-pretty` — в dev-режиме строки `openrouter completion` будут сырым JSON среди pretty-вывода воркера (`index.ts:19` строит логгер с `isPretty` при `NODE_ENV=development`; `logger.ts:9-29` имеет `redact` и transport). В тестах шума нет: `grep -c "openrouter completion"` по полному выводу `vitest run` = 0 (тесты адаптера передают `log: vi.fn()` либо не передают `log`; тесты фабрик не вызывают `chat`). `graph:migrate` (`worker/package.json`: `node dist/graph/migrate-cli.js`) импортирует только `./migrate.js` → `./graph/config.js` — ни `worker/src/config.ts`, ни `provider.ts` не загружаются, инстанс не создаётся. Невалидный `LOG_LEVEL` не доходит до pino: `provider.ts:17` импортирует `../config.js`, а `config.ts:49` выполняет `loadConfig()` при импорте, где `LOG_LEVEL` — enum из 7 допустимых pino-уровней (`config.ts:27-29`); ESM вычисляет `config.js` раньше тела `provider.ts`, значит при `LOG_LEVEL=verbose` процесс падает в `config.ts` с понятным сообщением, а не в pino (`levels.js:83 'unknown level'`). В тестах `config.ts` нигде не мокается (`grep vi.mock(.*config` пуст). Утверждение о цикле верно: `logger.ts:6` импортирует `describeLlmSettings, resolveLlmSettings` из `./llm/provider.js`. Альтернатива «передать логгер с места вызова» была частично доступна: в `jobs/protocol-generation.ts:326` в области видимости есть `log` (разрешённый путь), а `memory/index.ts:99` (`ctx.log` есть) — вне разрешённых путей, потребовал бы вопрос. Отклонение принимаю; серьёзность Low (не бросает на старте). Косметика: `describeLlmSettings` дублирует литерал `8192` вместо `OPENROUTER_DEFAULT_MAX_TOKENS` (`provider.ts:93`).

**В2. Содержимое info-строки.** `openrouter.ts:212-218`: `model` (из ответа или `this.model`), `finishReason`, `tokensIn`, `tokensOut`, `reasoningTokens`. Ни `req.system`, ни `req.user`, ни `text`, ни `this.apiKey` в контекст не попадают. Ошибочные тексты по-прежнему проходят через `scrub()` (`:199`), а новые сообщения (`:223`, `:228`) содержат только числа и `finish_reason`. Подтверждено.

**В3. `reasoning` только у OpenRouter.** `kieai.ts` и `memory/kieai-completion.ts` не в диффе; grep по ним: только `max_tokens` (`kieai.ts:174`, `kieai-completion.ts:56`), слова `reasoning` нет. У OpenRouter `reasoning` ставится безусловно (`openrouter.ts:157`), `response_format` добавляется spread-ом при `json` (`:158`) — оба поля в одном теле для `complete({responseFormat:'json'})`. Тест `openrouter.test.ts:144-161` проверяет `response_format` через `toMatchObject` и не утверждает `reasoning` одновременно, тест `:213-223` проверяет `reasoning` только для `generate()`. Совместное наличие подтверждено чтением кода, не тестом (Info). Конфликт `json_object` + `reasoning.enabled:false` на стороне OpenRouter вживую не проверялся — на живую проверку оркестратора (шаг памяти MEMORY_EXTRACT первым покажет).

**В4. `complete()` и шаги памяти.** `pipeline.ts:105-106` всегда передаёт `maxTokens` в `complete()`; вызовы: MEMORY_EXTRACT `8192` (`:127`), MEMORY_RESOLVE `8192` (`:185`), MEMORY_SUMMARY `4096` (`:220`). Других вызовов `.complete(` в `worker/src` нет (grep). Следовательно `LLM_MAX_TOKENS` влияет только на генерацию протокола (`generate()`); ни один шаг памяти им не затронут. Подтверждено тестом `openrouter.test.ts:225-240` (`complete` с `maxTokens: 4096` при опции 12000 → 4096).

**В5. `finish_reason==='length'` при непустом `content`.** `openrouter.ts:219` ветвится только при пустом `text`; обрезанный протокол возвращается как успех, далее `protocol-generation.ts:335` `validateProtocolSections` — упадёт в FAILED только если потерян обязательный раздел, иначе обрезанный текст сохраняется молча. На базе то же, но без диагностики; теперь строка `openrouter completion` несёт `finishReason:'length'` при `tokensOut≈max_tokens` — обнаружимо по логам. Пакет этого не требовал — backlog (см. Low-2).

**В6. Статус ошибки.** `openrouter.ts:222-225`: `{ status: response.status }` (200) без `isTransient` → `LlmProviderError.isTransient = false` (`errors.ts:20`). Протокол: `protocol-generation.ts:470` `shouldRetry = isTransientLlmError(err) && …` → false → FAILED сразу. Память: `memory/index.ts:60` `err instanceof LlmProviderError && !err.isTransient → UnrecoverableError` → без повторов. Тест `openrouter.test.ts:242-250` утверждает `isTransientLlmError(err) === false`. Подтверждено.

**В7. Валидация env.** `config.ts:20-22`: `LLM_MAX_TOKENS=abc`/`100`/`1.5` и `LLM_REASONING=none` → `LlmEnvSchema` fail → `resolveLlmSettings` бросает `LlmConfigError` (`provider.ts:48-53`), которую `buildLogger` (`logger.ts:31`) поднимает на старте; кроме того `config.ts:49` `loadConfig()` при импорте тоже отвергает (тот же `LlmEnvSchema` через `extend`). Тест `provider.test.ts:104-110` покрывает `max`, `on`, `255`, `lots`, `1.5`. В `.env.example:75-79` указаны допустимые значения и диапазон, но не сказано явно, что невалидное значение останавливает воркер (у `OUTBOUND_PROXY_URL` строкой выше это написано). Info.

**В8. Мутации** — таблица в разделе 6. M1–M5, M7, M8 убиты; **M6 и M6b выжили**.

**В9. Что убрано относительно базы.** Ничего не удалено. Изменения потолка: `generate()` на OpenRouter `max_tokens` 4096 → 8192 (`openrouter.ts:46,127`) — растёт верхняя граница стоимости выхода, реальный расход определяет длина ответа (по фактам пакета ~2,5 тыс. токенов при reasoning off); дефолт `complete()` без `maxTokens` тоже 4096 → 8192, но таких вызовов нет (В4). Тест паритета: равенство `system`/`user` текстов с kie.ai по-прежнему утверждается (`openrouter.test.ts:196-197`), ослаблено только `max_tokens` (`:199-200` — теперь две явные константы). `describeLlmSettings` для kie.ai строка не изменилась (`provider.test.ts:111-113`). Регрессий нет.

## 4. Находки по убыванию серьёзности

**Medium-1 — `worker/src/llm/provider.ts:99-109`: связка env → конструктор не покрыта тестом.** Сценарий: правка, при которой `openRouterProvider` перестаёт передавать `reasoning` и/или `maxTokens` (M6, M6b) → `LLM_REASONING=low` / `LLM_MAX_TOKENS=16000` в проде молча игнорируются, адаптер шлёт `{enabled:false}`/8192 — тесты зелёные (111/111). Тесты фабрик (`provider.test.ts:117-133`) проверяют только `instanceof`. Требование (условие ACCEPT): один тест в `provider.test.ts` — `createLlmProvider({ OPENROUTER_API_KEY, LLM_REASONING:'low', LLM_MAX_TOKENS:'12000' })` + `vi.stubGlobal('fetch', …)` → в теле `reasoning: {effort:'low'}`, `max_tokens: 12000`; аналогично для `createCompletionProvider`. Не регрессия (на базе связки не было).

**Low-1 — `worker/src/llm/provider.ts:96-97`: модульный pino без `redact`/pretty.** Строки `openrouter completion` в dev идут сырым JSON мимо pretty-транспорта воркера, без базовых полей/редакции `logger.ts`. Сейчас в контексте только числа и модель, утечки нет. Принимается как отклонение; кандидат в backlog: опциональный второй параметр фабрик `createLlmProvider(env, log?)` с передачей `log` из `protocol-generation.ts:326` и `memory/index.ts:99`.

**Low-2 — `worker/src/llm/openrouter.ts:219-231`: обрезанный ответ (`finish_reason:'length'`, непустой `content`) возвращается как успех.** Протокол может сохраниться усечённым, если обязательные разделы уцелели. Детектируемо по логу (`finishReason`). Не требовалось пакетом; backlog: при `finish_reason==='length'` и непустом тексте — хотя бы warn или постоянная ошибка «protocol truncated».

**Info-1 — `.env.example:75-79`:** не сказано, что невалидное значение `LLM_REASONING`/`LLM_MAX_TOKENS` останавливает воркер на старте (у `OUTBOUND_PROXY_URL` сказано). Info-2 — `provider.ts:93`: литерал `8192` вместо `OPENROUTER_DEFAULT_MAX_TOKENS`. Info-3 — совместное присутствие `reasoning` + `response_format` в одном теле не утверждается ни одним тестом (подтверждено только чтением `openrouter.ts:157-158`).

## 5. Отклонения из тела PR

1. Отдельный `pino`-инстанс в `provider.ts` — **принято** (цикл `logger.ts:6 → provider.ts` реален; `memory/index.ts` вне разрешённых путей; не бросает на старте, в тестах шума нет). Backlog по Low-1.
2. Тест паритета больше не требует равных `max_tokens` — **принято**: прямое следствие пункта объёма 2 («дефолт kie.ai не менять»); паритет текстов сохранён (`openrouter.test.ts:196-197`).
3. `.env.example` вне разрешённых путей — **принято** по A-13 (две переменные, `.env.example:75-85`, других изменений в файле нет).
4. `CLAUDE.md`/`AGENTS.md` не синхронизировались — **принято** по D-17.

## 6. CI, размер, тесты, мутации

- **CI:** `gh pr checks 26 --repo ITSalt/transcriber` → `Lint + Typecheck + Test  pass  3m0s`; `gh run view 37818023651` → `status: completed, conclusion: success, headSha: 4267b4bb57…`.
- **Размер:** 6 files changed, 198 insertions(+), 21 deletions(-); один коммит `4267b4b` над `0f14bc7de3` (merge-base = `0f14bc7de3`). `gh pr view`: `mergeable: MERGEABLE`.
- **Команды в клоне** (`review_clone.sh … --sha 4267b4bb57…`, HEAD клона проверен = `4267b4bb574a4d709199d788a8747c808edf70b1`):
  - `pnpm install --frozen-lockfile` → exit 0
  - `pnpm --filter @transcrib/api run db:generate` → exit 0
  - `pnpm --filter @transcrib/shared build` → exit 0
  - `pnpm --filter @transcrib/worker test` → exit 0; повторно `vitest run` в `worker/`: `Test Files 36 passed | 2 skipped (38)`, `Tests 425 passed | 8 skipped (433)` — совпадает с заявлением PR
  - `pnpm -r typecheck` → exit 0
  - `pnpm exec eslint .` в `worker/` → exit 0, `0 errors, 296 warnings` (предсуществующие `no-explicit-any`)
  - `git diff --stat 0f14bc7de3 HEAD -- worker/src/llm/kieai.test.ts worker/src/llm/kieai.ts worker/src/memory/kieai-completion.ts worker/src/memory/pipeline.ts` → пусто
- **Мутации** (каждая: правка → `vitest run src/llm src/config.test.ts` (111 тестов) → `git checkout`, откат подтверждён `git diff --quiet`):

| # | Мутация | Результат | Красные тесты |
|---|---|---|---|
| M1 | `openrouter.ts:157` удалить `reasoning` из тела | **убита** (1 failed) | `reasoning is {enabled:false} by default and {effort} when set` |
| M2 | `openrouter.ts:117` default `'low'` вместо `'off'` | **убита** (1 failed) | тот же |
| M3 | `openrouter.ts:127` `generate()` → `4096` | **убита** (5 failed) | `posts system+user messages with max_tokens 8192…`, 3× `prompt parity…`, `max_tokens: the option for generate()…` |
| M4 | `openrouter.ts:220-226` убрать ветку `finishReason === 'length'` | **убита** (1 failed) | `finish_reason length with null content → permanent error…` |
| M5 | `openrouter.ts:236` `tokensOut: reasoningTokens` | **убита** (2 failed) | `maps the reply: trimmed text, tokens…`, `a normal reply maps as before…` |
| M6 | `provider.ts:106` не передавать `maxTokens` в конструктор | **ВЫЖИЛА** (111 passed) | — |
| M6b | `provider.ts:105` не передавать `reasoning` в конструктор | **ВЫЖИЛА** (111 passed) | — |
| M7 | `config.ts:22` default `4096` | **убита** (3 failed) | `defaults: reasoning off, 8192…`, `startup line`, `OUTBOUND_PROXY_URL: the startup line…` |
| M8 | `config.ts:20` default `'low'` | **убита** (3 failed) | те же три |

## 7. Очистка

Клон удалён: `review_clone.sh --cleanup /tmp/claude-1004/-home-cloudpc-projects-transcriber/4310f49e-95eb-4aeb-8d49-40bf49c26179/scratchpad/clones/orch-review.TdXmEe` → `removed …/orch-review.TdXmEe`, exit 0; каталог `clones/` больше не содержит клона. Главный checkout `/home/cloudpc/projects/transcriber` и рабочее пространство оркестратора не изменялись (в главном checkout выполнен только `git fetch origin feature/wp-worker-05-openrouter-reasoning`, рабочее дерево не затронуто).
