# Сверка — WP-WORKER-03 (PR https://github.com/ITSalt/transcriber/pull/24, `33f870eacd` -> `main @ b17ab2303f`) — 2026-10-08

Раунд 1. Дифф: 15 files changed, 677 insertions(+), 33 deletions(-) (файлов: 15).

**Решение: `ACCEPTED WP-WORKER-03`** — адаптер OpenRouter, фабрика провайдера по env и общий класс ошибок реализованы по пакету; 6 критериев подтверждены тестами в одноразовом клоне (worker 397 passed, typecheck 0, CI run 37808219942 pass) и мутациями M1–M6/M8 (все красные); деплой-шаг graph:migrate не затронут; прод-env (ключ + LLM_MODEL, без LLM_PROVIDER) резолвится в openrouter; json_object для anthropic/claude-haiku-5.5 проверен живьём оркестратором; регрессий относительно базы нет; находки Low/Info.

## Пункты REVISE

нет

### Не требуется

- Не расширять scrub ключа и не добавлять тест таймаута при чтении тела в этом раунде (Info-1, Info-6) — backlog.

## Вопросы владельцу

нет

## Принято как есть / backlog

- Low-1: `createCompletionProvider(env)` в `worker/src/memory/index.ts:99` не покрыт (мутация M7 зелёная); backlog: тест в `register.test.ts` с `overrides.env` без `overrides.llm`.
- Low-2: `LLM_TIMEOUT_MS` валидируется как целое ≥ 1000 при импорте `config.ts` — новый режим отказа на старте, в `.env.example` правило не описано; backlog: одна строка в `.env.example`.
- Info: таймаут при чтении тела подтверждён рецензентом локально, теста в PR нет; строковый `error.code` → классификация по HTTP-статусу (безопасно, без теста); транзиентность в логе памяти различима только по типу исключения; kie.ai-ключ при переданном `env` всё равно читается из `process.env` (как на базе); `max_tokens: 8192` шагов памяти через OpenRouter живьём не проверен — проверить первую генерацию памяти на проде; scrub только точного вхождения ключа; CI-аннотации `no-explicit-any` — существующие warnings.
- Отклонения PR приняты: `kieai-completion.ts` не менялся; `input.model` игнорируется адаптером OpenRouter (вызывающих с нестандартной моделью нет); стартовая строка в `logger.ts`; D-17; `register.test.ts` +7 строк (в рамках автонаходки 3); `LlmEnvSchema` включена в `EnvSchema` (валидация при импорте).
- Автонаходки: `.env.example` и `memory/index.ts` — по A-11; `register.test.ts` — принято.
- graph: checked — пакет не меняет узлы спецификации (поле «Граф: нет»; ADR-007 допускает новые адаптеры за ILlmProvider), ревью это подтвердило: diff не трогает `.tl/**` и граф.
- Слот слияния: следующий после API-MEMORY-01 (очередь свободна); merge = прод-деплой; после доставки — `ASR_KEYTERMS_ENABLED=true` и OpenRouter вступают в силу при перезапуске воркера (D-31, D-32).
- Полный `pnpm test` в клоне: один флаки-таймаут `web/src/routes/upload/context.test.tsx:239` (web не менялся, повтор ×2 зелёный, CI pass) — не из этого PR.

## Автоматические находки

- **пути и замки**: WP-WORKER-03: shared path .env.example changed without the lock
- **пути и замки**: WP-WORKER-03: shared path worker/src/memory/index.ts changed without the lock
- **пути и замки**: WP-WORKER-03: worker/src/memory/register.test.ts is outside the allowed paths

Дифф ревизии (пересдачи): —

---

## Отчёт рецензента (дословно)

# Отчёт рецензента — PR #24, WP-WORKER-03, head `33f870eacd565cdcbacf2f0f06336f2223f664ad` vs main `b17ab2303fd05e5d35b26de3dfe45b2f209d3f9d`

## 1. Вердикт: **ACCEPT**

Все шесть пунктов объёма реализованы и покрыты тестами; шесть критериев приёмки подтверждены кодом/тестами/прогоном в одноразовом клоне. Семантика повторов (TECH-026) сохранена для обоих провайдеров (мутация M6 роняет 5 регрессионных тестов, в т.ч. P4a/P4f/P5c/P5d и тест памяти). Деплой-шаг `graph:migrate` не затронут (`migrate-cli.ts` не импортирует ни `logger.ts`, ни `config.ts`). Прод-окружение (OPENROUTER_API_KEY + LLM_MODEL=anthropic/claude-haiku-5.5, LLM_PROVIDER не задан) резолвится в openrouter без ошибки. Регрессий относительно базы не найдено; единственное изменение поведения — выбор OpenRouter при наличии ключа — запланировано D-32 и задокументировано в `.env.example`. Остались только замечания уровня Low/Info (одна непокрытая строка `createCompletionProvider(env)`, недокументированная валидация `LLM_TIMEOUT_MS` на старте) — не блокируют.

## 2. Объём и критерии → код → статус

| Объём | Где | Статус |
|---|---|---|
| 1. Адаптер OpenRouter: ILlmProvider + ILlmCompletionProvider, fetch Node 20, те же промпт-билдеры, max_tokens 4096 / maxTokens, response_format json_object + stripCodeFence, заголовки Referer/X-Title, AbortSignal.timeout (180 с, LLM_TIMEOUT_MS, транзиент) | `worker/src/llm/openrouter.ts:74-185` (класс), `:92-99` generate с `loadProtocolSystemPrompt`/`renderProtocolUserMessage`, `:102-111` complete + stripCodeFence, `:126` response_format, `:134-141` заголовки + signal, `:151-155` таймаут → isTransient:true; `OpenRouterCompletionProvider` алиас `:188` | Сделано |
| 2. Класс ошибки с `status/reason/isTransient`; общая проверка для обоих провайдеров; тело без ключа | `worker/src/llm/errors.ts:9-27` (`LlmProviderError`, `isTransientLlmError` по instanceof), `openrouter.ts:49-54` `OpenRouterLlmError`, `kieai.ts:56-61` `KieAiLlmError extends LlmProviderError`; скраб ключа `openrouter.ts:114-116,165`; потребители `jobs/protocol-generation.ts:34,470`, `memory/index.ts:60` | Сделано |
| 3. `provider.ts` с `createLlmProvider`/`createCompletionProvider`; дефолты по ключу; Zod в `config.ts`; `.env.example` | `worker/src/llm/provider.ts:36-60` (`resolveLlmSettings`), `:67-79` фабрики; `config.ts:12-19` `LlmEnvSchema`, `:21` включена в `EnvSchema`; подключение `protocol-generation.ts:326`, `memory/index.ts:99`; `.env.example:63-73` | Сделано |
| 4. `LlmModel` открытое объединение; `LLM_MODEL_DEFAULT` для kie.ai; `LlmResult.model` из ответа | `shared/src/llm/ILlmProvider.ts:19,22`; `openrouter.ts:180`; запись `protocol-generation.ts:384` (`model: llmResult.model`), память `pipeline.ts:110` → `postgres.ts:46`; колонка `ProtocolGeneration.model String` (`api/prisma/schema.prisma:413`) | Сделано |
| 5. Логи: стартовая строка; на ошибку — статус, транзиентность, ≤300 символов тела без ключа | `logger.ts:31` + `provider.ts:63-65`; сообщение ошибки `openrouter.ts:163-167` (HTTP-статус, code, excerpt 300, scrub); транзиентность в логе джоба `protocol-generation.ts:472-482` (`shouldRetry`), память `memory/index.ts:121-123` | Сделано (см. Info-3) |
| 6. Промпты, классификация BullMQ, контракт kie.ai не менялись; kie.ai-провайдеры работают при `LLM_PROVIDER=kieai` | diff не трогает `worker/src/llm/prompts/**`, `queues.ts`, `job-processor.ts`, `.tl/external-contracts/**`; `kieai.test.ts`/`kieai-completion.test.ts` не в diff; `provider.test.ts:30-32,68` | Сделано |

| Критерий приёмки | Доказательство | Статус |
|---|---|---|
| 1. Unit-тесты адаптера с подменённым fetch | `worker/src/llm/openrouter.test.ts:28-48` (тело/заголовки), `:50-66` (маппинг, model из ответа), `:68-75` (пустой → постоянная), `:77-97` (408/429/5xx транзиент, 400/401/402/403/413 постоянные, код внутри 200), `:111-121` (таймаут), `:123-128` (ключ не в сообщении), `:142-159` (json_object, maxTokens, fence) | Выполнен |
| 2. Тест фабрики | `provider.test.ts:17-20` (нет ключа → kieai), `:22-28` (ключ → openrouter + haiku-5.5), `:30-32` (kieai при ключе), `:45-48` (неизвестный → `LlmConfigError`), `config.test.ts:48-53` (старт) | Выполнен |
| 3. Повторы BullMQ с ошибкой OpenRouter | `protocol-generation.regression.test.ts:415-454` (P4a-or 503 → rethrow без FAILED; P4c-or 402 → FAILED сразу), `memory/register.test.ts:206-212`; мутация M6 — 5 красных | Выполнен |
| 4. Паритет промпта байт-в-байт | `openrouter.test.ts:177-197` (EN, RU, RU+context; system, user, max_tokens равны kie.ai) | Выполнен |
| 5. typecheck/test зелёные; kieai-тесты без изменений | клон: `pnpm --filter @transcrib/worker test` exit 0 (397 passed/8 skipped/405), `pnpm -r typecheck` exit 0; корень — см. п. 6; CI pass | Выполнен |
| 6. Таблица env в PR | тело PR, раздел «Переменные окружения для прода» | Выполнен |

## 3. Ответы на вопросы риска

**1. Стартовая связка `buildLogger()` → `resolveLlmSettings()`.** Единственный вызов `buildLogger` — `worker/src/index.ts:19` (`git grep` по `$H -- worker/`: `index.ts:14,19`, определение `logger.ts:8`; ни один тест не импортирует `logger.js`). `graph:migrate` = `node dist/graph/migrate-cli.js` (`worker/package.json`), а `migrate-cli.ts` импортирует только `dotenv/config` и `./migrate.js` → `graph/config.ts` (только `zod`) и `graph/driver.js`; ни `logger.ts`, ни `worker/src/config.ts` в этой цепочке нет — деплой-шаг в `.github/workflows/deploy-production.yml:91` не затронут. Для `index.ts` в проде: pm2 `cwd: /opt/transcrib/worker`, `env_file: '.env'` (`ecosystem.config.cjs:25,30`); с OPENROUTER_API_KEY и LLM_MODEL=anthropic/claude-haiku-5.5, без LLM_PROVIDER `resolveLlmSettings` даёт `openrouter` без исключения (`provider.ts:45-52`); KIE_API_KEY не требуется ни для kieai на этом этапе (`provider.ts:50` проверяет только модель), ни для openrouter. В CI env не содержит LLM-переменных → kieai, исключений нет (CI pass). Важно: `provider.ts:14` импортирует `../config.js`, где `export const config = loadConfig()` (`config.ts:45`) выполняется при импорте — то есть любой модуль, импортирующий `protocol-generation.ts` или `memory/index.ts`, теперь валидирует `LLM_PROVIDER`/`LLM_TIMEOUT_MS` из `process.env` при импорте. В CI/проде это безвредно; новый режим отказа — только при невалидных значениях (см. Low-2). Не REVISE.

**2. `env` в `memory/index.ts`.** `const env = overrides.env ?? process.env` — `memory/index.ts:76`, та же переменная, которой пользуются `readMemoryNeo4jConfig(env)` (`:77`) и `readMemorySettings(env)` (`:82`); `createCompletionProvider(env)` на `:99` получает ровно её. Fallback на `process.env` — намеренный (в сигнатуре фабрики дефолт `= process.env`, `provider.ts:74`). Не протестировано: мутация M7 (`createCompletionProvider(env)` → `createCompletionProvider()`) оставляет все 405 тестов зелёными — в `register.test.ts` ни один тест не передаёт `OPENROUTER_API_KEY` в `overrides.env` без `overrides.llm`. Код корректен, пробел только в покрытии (Low-1).

**3. Нет KIE_API_KEY при провайдере kieai.** База: `protocol-generation.ts:325` `new KieAiLlmProvider()` → `kieai.ts:162-168` (база) бросает `KieAiLlmError` с `isTransient=false` внутри `try` → catch → `shouldRetry=false` → FAILED. Head: `protocol-generation.ts:326` `createLlmProvider(deps?.env)` → `provider.ts:71` `new KieAiLlmProvider({ apiKey — undefined })` → `kieai.ts:149` тот же `throw` (ctor: `opts?.apiKey ?? process.env['KIE_API_KEY']`) → тот же catch → FAILED. Память: база `memory/index.ts:99` лениво `new KieAiCompletionProvider()` → `kieai-completion.ts:35` throw → `processMemoryJob` → `UnrecoverableError`; head `provider.ts:78` → тот же `kieai-completion.ts:35` → `memory/index.ts:60` → `UnrecoverableError`. Исход одинаков. Нюанс: при переданном `deps.env` без KIE_API_KEY конструктор всё равно смотрит `process.env['KIE_API_KEY']` (Info-4).

**4. Lock vs 180 с.** `LOCK_DURATION_MS = 60_000` (`job-processor.ts:38`, обе очереди `:73,:79`), `MEMORY_LOCK_DURATION_MS = 120_000` (`memory/index.ts:38,119`); `stalledInterval`/`maxStalledCount` нигде не заданы → дефолты BullMQ (30 с / 1). BullMQ продлевает lock таймером каждые `lockDuration/2`, пока процессор работает и event loop не заблокирован; `await fetch(...)` loop не блокирует, поэтому 180-секундный вызов (+ чтение тела, покрытое тем же сигналом) не ведёт к stalled/двойному запуску. На базе `kieai.ts` вообще не имел таймаута (`grep -i "timeout|signal"` по базовому файлу — только комментарий на `:204`) при ~100-секундных вызовах — head строже (ограничен 180 с). Регрессии нет; остаточный риск только при блокировке CPU дольше 60 с — не из этого пакета, цифры выше.

**5. Эффективный статус.** `openrouter.ts:160-161`: `bodyCode` берётся только если `error.code` — число; иначе `status = response.status`. Проба в клоне (временный тест, удалён): HTTP 200 + `code:'rate_limited'` → `status 200, transient false` (постоянная → FAILED сразу, повтор через F-004); HTTP 503 + строковый code → `status 503, transient true`; HTTP 200 + `code:'429'` (строка) → постоянная. Это безопасный выбор (нет «вечных» повторов по непонятному коду; HTTP-статус остаётся авторитетным), но явного теста на строковый `code` в `openrouter.test.ts` нет (Info-2). `metadata.raw`: `bodyExcerpt(body, 300)` сериализует всё тело и режет на 300 символах (`errors.ts:30-34`, `openrouter.ts:163`); проба с `raw` 2000 символов дала `message.length 334`; тест `openrouter.test.ts:99-104` (HTML 1000 символов → `< 450`).

**6. Таймаут и чтение тела.** `response.text()` — внутри того же `try` (`openrouter.ts:143`), `signal: AbortSignal.timeout` (`:141`) в undici отменяет и чтение тела. Тест в PR покрывает только таймаут до заголовков (`openrouter.test.ts:111-121`, fetch никогда не резолвится). Я проверил случай «заголовки пришли, тело зависло» реальным fetch на localhost (временный тест с `node:http`, timeoutMs 1000): результат `{"name":"OpenRouterLlmError","msg":"OpenRouter request timed out after 1000 ms","transient":true,"reasonName":"TimeoutError","dt":1016}` — транзиент, как заявлено. Пробел в тестах PR — Info-1.

**7. Закрытые множества для `model`.** `git grep "LlmModel|claude-sonnet-4-6|gpt-5-4|LLM_MODEL_DEFAULT" $H -- shared/src api/src web/src api/prisma` — совпадения только в `shared/src/llm/ILlmProvider.ts`; `z.enum`/`model:` схем в `shared/src/api`, `api/src` нет (0 строк); в `web/src` нет упоминаний. `ProtocolGeneration.model String` (`schema.prisma:413`); запись шагов памяти идёт в ту же таблицу (`memory/postgres.ts:46`). `anthropic/claude-haiku-5.5` нигде не отвергается.

**8. Guard kie.ai.** На месте в обоих провайдерах: `kieai.ts:159-162` (`if (model !== 'claude-sonnet-4-6') throw`), `kieai-completion.ts:43-44`; `MODEL_ALIAS[model]` на `kieai.ts:164` выполняется только после guard. Мутация M8 (отключение guard в `generate`) роняет `kieai.test.ts:135` — покрыто.

**9. JSON-путь памяти.** `llm-output.ts:17-33` `parseJsonObject` сам снимает ```-ограждения и берёт подстроку от первого `{` до последнего `}` — терпим к хвостовому тексту, зависимости от kie.ai-специфики нет; `stripCodeFence` в адаптере (`openrouter.ts:110`) избыточен, но безвреден (мутация M4 ловится тестом `openrouter.test.ts:142`). `maxTokens` шагов: EXTRACT 8192, RESOLVE 8192 (`pipeline.ts:127,185`), SUMMARY 4096 (`:220`) — передаются как `max_tokens` без изменения (`openrouter.ts:107,125`), ровно как у kie.ai (`kieai-completion.ts:56`). Дефолт 4096 применяется только когда шаг не передал `maxTokens` — как на базе. Приём 8192 моделью haiku-5.5 живьём не проверялся (у оркестратора проба была без `max_tokens` 8192) — Info-5.

**10. Секреты.** Ключ только в заголовке `Authorization` (`openrouter.ts:136`); URL = `${baseUrl}/chat/completions` без ключа (`:132`). В сообщение ошибки попадает только статус + excerpt тела со `scrub` (`:165`); `reason` для транспортных ошибок — исключение undici (`TypeError: fetch failed` с `cause`), заголовков не содержит; джоб логирует `error: errorMessage` (строка, `protocol-generation.ts:475`), память — `error_reason: err.message` (`memory/index.ts:122`). Заголовки не логируются. `git diff $B $H | grep -i "sk-or-v1|sk-or-[A-Za-z0-9]{20,}|OPENROUTER_API_KEY=…"` — пусто; фикстура `KEY = 'sk-or-secret-key-123'` (`openrouter.test.ts:9`) — заведомо фальшивая; в теле PR ключей нет. Ограничение: scrub заменяет только точное вхождение ключа (Info-6).

**11. Что база позволяла и что изменилось.** (a) Стенд с обоими ключами и без `LLM_PROVIDER`: база — kie.ai всегда; head — OpenRouter (`provider.ts:45`); задокументировано `.env.example:64-65` и в таблице PR; по D-32. (b) Новые отказы на старте: `LLM_PROVIDER` вне enum и `LLM_TIMEOUT_MS` не целое/`< 1000` → `config.ts:33-41` бросает при импорте `config.ts`; первое задокументировано в `.env.example:65`, второе — нет (Low-2). (c) `isTransientLlmError` из `kieai.ts` теперь истинна и для `OpenRouterLlmError` (реэкспорт `kieai.ts:63`) — намеренно. (d) Per-call `input.model` адаптер OpenRouter игнорирует (`openrouter.ts:25-27`); на базе `protocol-generation.ts:323` всегда передаёт `LLM_MODEL_DEFAULT`, а `pipeline.ts:106` — `deps.model`, который в `memory/index.ts:97-104` не задаётся → фактических вызывающих с нестандартной моделью нет; поведения не потеряно. Удалённых возможностей, необратимых переходов, изменений состояний — нет.

**12. Мутации** — таблица в п. 6.

## 4. Находки

**Low-1.** `worker/src/memory/index.ts:99` — вызов `createCompletionProvider(env)` не покрыт: мутация M7 (`→ createCompletionProvider()`) зелёная (397 passed). Сценарий: будущая правка, которая потеряет `env`, останется незамеченной тестами; в проде `overrides.env` не используется, поэтому эффекта сейчас нет. Требовать: тест в `register.test.ts`, где `overrides.env` содержит `MEMORY_NEO4J_URI` + `OPENROUTER_API_KEY` без `overrides.llm`, и проверка, что `deps.llm()` — `OpenRouterLlmProvider` (можно в следующем пакете).

**Low-2.** `worker/src/config.ts:18` — `LLM_TIMEOUT_MS` валидируется как целое `>= 1000` при импорте `config.ts` (`:45`); значение вроде `LLM_TIMEOUT_MS=60s` или `500` остановит воркер на старте с «Invalid environment configuration», а `.env.example:68` и таблица PR описывают только дефолт 180000, не правило валидации. Новый режим отказа относительно базы (по замыслу «ошибка конфигурации на старте», но недокументированный). Требовать: одну строку в `.env.example` (целое число мс, минимум 1000). Не блокирует.

**Info-1.** `openrouter.test.ts:111-121` покрывает таймаут только до заголовков; таймаут при чтении тела подтверждён мной локальным сервером (см. вопрос 6), в PR теста нет.

**Info-2.** Строковый `error.code` (`openrouter.ts:160`) → классификация по HTTP-статусу; поведение разумное, но в тестах не зафиксировано.

**Info-3.** Пункт объёма 5 «транзиентность на каждую ошибку»: для протокола пишется `shouldRetry` (`protocol-generation.ts:479`), для памяти лог `failed` (`memory/index.ts:121-123`) содержит только `error_reason`; транзиентность различима лишь по типу исключения (`UnrecoverableError` vs rethrow). Косметика.

**Info-4.** `provider.ts:71,78` — `new KieAi…Provider({ apiKey — s.kieApiKey })` при `kieApiKey === undefined` падает обратно на `process.env['KIE_API_KEY']` (`kieai.ts:149`, `kieai-completion.ts:34`): переданный в фабрику `env` для kie.ai-ключа не изолирован. На базе было так же (ключ читался только из `process.env`).

**Info-5.** `max_tokens: 8192` для шагов EXTRACT/RESOLVE через OpenRouter живьём не проверялся (ограничение — ключа у рецензента нет; проба оркестратора была без этого параметра). При отказе модель/шлюз вернёт 400 → постоянная ошибка → `UnrecoverableError` в памяти — безопасный, но заметный исход; рекомендовать проверить первую генерацию памяти в проде после переключения.

**Info-6.** `openrouter.ts:114-116` — scrub только точного вхождения ключа; URL-кодированное/усечённое эхо не вырезается. На базе у kie.ai скраба не было вовсе.

**Info-7.** CI-аннотации «Unexpected any» — предупреждения `no-explicit-any` в существующих тестовых файлах (`api/src/features/*/…test.ts`, `worker/src/job-processor.test.ts`, `protocol-generation.regression.test.ts` и др.); новые тесты P4a-or/P4c-or используют `as any` в стиле файла. Warnings, не errors; не из этого PR по существу.

Регрессий относительно базы не найдено.

## 5. Отклонения (Deviations)

| Заявлено | Проверка | Решение |
|---|---|---|
| `kieai-completion.ts` не менялся; `stripCodeFence` импортируется из него | diff-stat: файла нет; `openrouter.ts:36` | Принято (A-11 разрешал правку, не требовал) |
| `input.model` игнорируется адаптером OpenRouter | `openrouter.ts:25-27,87,120`; тест `openrouter.test.ts:60-66`; вызывающих с нестандартной моделью нет (вопрос 11d) | Принято; отметить, что комментарий в `shared/src/llm/ILlmProvider.ts:35` («per-call override accepted») для OpenRouter не действует — Info |
| Стартовая строка в `logger.ts`, т.к. `index.ts` — общий путь | `logger.ts:31`; `logger.ts` в разрешённых путях пакета | Принято; побочный эффект — `buildLogger` теперь может бросать (`LlmConfigError`), только для `index.ts` |
| Нет AGENTS.md sync (D-17) | diff не трогает `CLAUDE.md`/`AGENTS.md` | Принято |
| Незаявленное: `worker/src/memory/register.test.ts` вне разрешённых путей | +7 строк внутри существующего теста `processMemoryJob` (`:206-212`), только проверка OpenRouter-ошибок в том же разбиении | Принято (ровно то, что допускает автонаходка 3) |
| Незаявленное: `worker/src/config.ts` теперь включает `LlmEnvSchema` в `EnvSchema` и валидирует при импорте; `provider.ts` импортирует `config.ts` | `config.ts:21,45`; `provider.ts:14` | Принято как реализация «описать в config.ts (Zod)»; см. Low-2 |

Автонаходки: 1) `.env.example` — только добавление 11 строк, без значений ключей — по A-11; 2) `memory/index.ts` — ровно замена импортов, `instanceof LlmProviderError` на `:60` и конструктора на `:99` — в рамках A-11; 3) `register.test.ts` — см. выше.

## 6. CI, размер, тесты, мутации

- **CI:** run `37808219942`, job «Lint + Typecheck + Test» (ID 113417989947) — **pass**, 2m57s (`gh pr checks 24` → `pass`; `gh run view 37808219942` → ✓). Аннотации — только warnings (Node 20 deprecation, `no-explicit-any` в существующих тестах).
- **Размер:** 1 коммит, 15 файлов, +677/−33 (`git diff --stat b17ab23 33f870e`); из них тесты ≈ 324 строки; соответствует размеру S.
- **Клон:** `review_clone.sh … --keep` → `git rev-parse HEAD` = `33f870eacd565cdcbacf2f0f06336f2223f664ad`; setup `pnpm install --frozen-lockfile` exit 0, `pnpm --filter @transcrib/api run db:generate` exit 0, `pnpm --filter @transcrib/shared build` exit 0.
- `pnpm --filter @transcrib/worker test` → exit 0: Test Files 34 passed | 2 skipped (36); Tests **397 passed | 8 skipped (405)**.
- `pnpm -r typecheck` → exit 0.
- `pnpm test` (корень) → exit 1: Test Files 1 failed | 78 passed | 9 skipped (88); Tests 1 failed | 1047 passed | 81 skipped (1129). Упал `web/src/routes/upload/context.test.tsx:239` («Test timed out in 5000ms») под нагрузкой полного прогона; повторный запуск `pnpm --filter @transcrib/web exec vitest run src/routes/upload/context.test.tsx` ×2 → 12 passed оба раза; web в PR не менялся; CI тот же набор прошёл. Расцениваю как флаки, не связанный с PR. (DB/Neo4j-тесты пропущены без DATABASE_URL — ожидаемо.)
- Дополнительные пробы (временные тест-файлы, удалены, `git status` чист): таймаут при чтении тела через localhost `node:http` → транзиент за 1016 мс; строковый `error.code` → см. вопрос 5.

| Мутация | Изменение | Результат `pnpm --filter @transcrib/worker test` |
|---|---|---|
| M1 | `openrouter.ts:57` — 5xx не транзиент | **6 failed** (`openrouter.test.ts` HTTP 500/502/503, error-in-200, non-JSON body, complete() classification) |
| M2 | `openrouter.ts:136` — убран `Authorization` | **1 failed** (`openrouter.test.ts:35` заголовки) |
| M3 | `provider.ts:45` — дефолт kieai при наличии ключа | **4 failed** (`provider.test.ts:23,35,56,63`) |
| M4 | `openrouter.ts:110` — без `stripCodeFence` | **1 failed** (`openrouter.test.ts:151`) |
| M5 | `openrouter.ts:126` — без `response_format` | **1 failed** (`openrouter.test.ts:154`) |
| M6 | `kieai.ts:56` — `KieAiLlmError extends Error` | **5 failed** (`protocol-generation.regression.test.ts` P4a, P4f, P5c, P5d; `register.test.ts:201`) |
| M7 (доп.) | `memory/index.ts:99` — `createCompletionProvider()` без `env` | **0 failed** — не покрыто (Low-1) |
| M8 (доп.) | `kieai.ts:159` — guard модели отключён | **1 failed** (`kieai.test.ts:135`) |

Каждая мутация откатывалась `git checkout -- .`; после серии `git status --short` пуст.

## 7. Очистка

`bash …/review_clone.sh --cleanup /tmp/claude-1004/-home-cloudpc-projects-transcriber/4310f49e-95eb-4aeb-8d49-40bf49c26179/scratchpad/clones/orch-review.NKunWn` → `removed …/orch-review.NKunWn`; в `…/scratchpad/clones/` остался только `node-compile-cache`. В `/home/cloudpc/projects/transcriber` и `/home/cloudpc/projects/transcriber-orch` ничего не записано (только `git fetch`/`git show`/`git diff` в основном чекауте); worktree модульной сессии не открывался; внешние вызовы к OpenRouter/kie.ai не делались.
