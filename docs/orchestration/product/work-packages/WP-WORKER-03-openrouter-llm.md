# WP-WORKER-03 — LLM-провайдер OpenRouter (anthropic/claude-haiku-5.5) за ILlmProvider, переключение провайдера по env

| Поле | Значение |
|------|----------|
| Поток | worker (area) |
| Репозиторий | /home/cloudpc/projects/transcriber |
| Базовая ветка | main |
| Линия | main |
| Рабочая ветка | `feature/wp-worker-03-openrouter-llm` |
| Worktree | `.claude/worktrees/wp-worker-03-openrouter-llm` (создаёт `claude -w wp-worker-03-openrouter-llm`) |
| Заголовок PR | `[PRODUCT] WP-WORKER-03: LLM-провайдер OpenRouter (anthropic/claude-haiku-5.5) за ILlmProvider, переключение провайдера по env` |
| Сессия | `product-worker` |
| Модель | `sonnet` |
| Усилие | — |
| Почему такая модель | модель реализатора по умолчанию (orch.yaml models.implement) |
| Режим | nacl: `/nacl-tl-dev` (TECH-задача: новый адаптер провайдера, конфигурация) по TDD, `/nacl-tl-review`; граф не трогать (ADR-007 уже допускает новые адаптеры за ILlmProvider) |
| Команды методологии: разрешены | nacl: `nacl-tl-dev-be`, `nacl-tl-dev`, `nacl-tl-fix`, `nacl-tl-review`, `nacl-tl-regression-test`, `nacl-tl-verify-code`, `nacl-tl-sync`, `nacl-tl-docs`, `nacl-tl-stubs`, `nacl-sa-uc`, `nacl-sa-domain`, `nacl-sa-feature`, `nacl-sa-validate`, `nacl-tl-plan`, `nacl-tl-status` |
| Команды методологии: запрещены | `nacl-tl-release`, `nacl-tl-deploy`, `nacl-tl-deliver`, `nacl-tl-hotfix`, `nacl-tl-ship`, `nacl-tl-conductor`, `nacl-tl-full`, `nacl-goal`, `nacl-publish` |
| Разрешённые пути | `worker/{tsconfig.json,vitest.config.ts}`, `worker/test/**`, `worker/src/{asr,jobs,lib,llm}/**`, `worker/src/{config.ts,config.test.ts,logger.ts,shutdown.ts,shutdown.test.ts,job-processor.test.ts,queues.test.ts,queues.regression.test.ts}` |
| Общие пути, которые трогает пакет | `shared/**` (только `shared/src/llm/ILlmProvider.ts`: тип `LlmModel` и `LLM_MODEL_DEFAULT`); вне разрешённых путей по A-11: `worker/src/memory/kieai-completion.ts`, `worker/src/memory/index.ts` (замена конструктора провайдера), `.env.example` (новые переменные) |
| Миграции | нет |
| Ресурсы (замки) | нет |
| Тестовая БД и порты | нет; нет |
| Слот слияния | <место в очереди слияний, задаётся при приёмке> |
| Контракт | `ILlmProvider` / `ILlmCompletionProvider` из `shared/src/llm/ILlmProvider.ts` без изменения сигнатур; новый внешний контракт `.tl/external-contracts/openrouter-chat.md` НЕ создавать в этом пакете (описание запроса/ответа — в заголовке файла адаптера, как в `kieai.ts`) |
| Зависит от | нет (все пакеты программы в PROD) |
| Размер | S |
| Спецификация | ADR-007 (ILlmProvider), TECH-011 (KieAiLlmProvider), DEC-001 (классификация ошибок LLM), TECH-026 (попытки BullMQ), FR-006 (шаги памяти через ILlmCompletionProvider) |
| Граф | нет (узлы не меняются; ADR-007 допускает новые адаптеры) |
| Решения | D-32 (переход на OpenRouter, модель anthropic/claude-haiku-5.5, ключ в прод-.env кладёт оркестратор); A-11 (правка двух файлов модуля worker-memory и .env.example) |

Общие пути этого репозитория (объяви те, что трогает пакет): `pnpm-lock.yaml`, `package.json`, `**/package.json`, `shared/**`, `api/prisma/**`, `.tl/{status.json,master-plan.md,changelog.md,release-status.json,deploy-plan.md}`, `.tl/external-contracts/**`, `graph-infra/**`, `config.yaml`, `CLAUDE.md`, `api/src/server.ts`, `worker/src/index.ts`, `worker/src/job-processor.ts`, `worker/src/queues.ts`, `web/src/App.tsx`, `web/src/i18n/**`.
Ресурсы этого репозитория, требующие замка: `migrations`, `graph` (по запросу: LOCK/UNLOCK, см. раздел 6), `dev-stack` (по запросу: LOCK/UNLOCK, см. раздел 6).

## 0. Подготовка worktree

1. Переключи worktree на ветку пакета: `git fetch origin && git switch -c feature/wp-worker-03-openrouter-llm origin/main`.
2. Подготовь worktree (команды из `orch.yaml`, выполнять внутри worktree):

   ```bash
   pnpm install --frozen-lockfile
   pnpm --filter @transcrib/api run db:generate
   ```
3. Правь только разрешённые пути; общие пути — только объявленные в шапке и после получения замка.

## 1. Факты

- kie.ai деградировал: 2026-10-08 14:41–16:05Z все 7 попыток генерации протокола (две встречи × 3 попытки + повтор через F-004) получили `HTTP 500 {"type":"api_error","message":"Server exception, please try again later"}` — `protocol_generation_jobs.error_msg`, `pm2 logs transcrib-worker`. Проба с VM: `POST https://api.kie.ai/claude/v1/messages` (8 токенов) — HTTP 200, но 34–36 с на ответ.
- Единственный провайдер протокола — `worker/src/llm/kieai.ts` (`KieAiLlmProvider implements ILlmProvider`, Anthropic-совместимый `POST {base}/messages`, классификация по эффективному статусу: 404/408/429/5xx и транспорт — транзиентные, 400/401/402/413 и пустой ответ — постоянные; `DEFAULT_MAX_TOKENS = 4096`; системный промпт из `worker/src/llm/prompts/{ru,en}/protocol.md` + `protocol-context.md` через `protocol-prompt.ts`). Подключается жёстко: `worker/src/jobs/protocol-generation.ts:34,325` (`deps?.llm ?? new KieAiLlmProvider()`), транзиентность проверяет `isTransientLlmError` из того же файла (`:468`).
- Шаги памяти проекта (FR-006) — `worker/src/memory/kieai-completion.ts` (`KieAiCompletionProvider implements ILlmCompletionProvider`, тот же эндпоинт, `responseFormat 'json'` + `stripCodeFence`), подключается в `worker/src/memory/index.ts:31,99` (`llm ??= new KieAiCompletionProvider()`).
- Тип модели: `shared/src/llm/ILlmProvider.ts:14-16` — `LlmModel = 'claude-sonnet-4-6' | 'gpt-5-4'`, `LLM_MODEL_DEFAULT = 'claude-sonnet-4-6'`; оба провайдера бросают ошибку на любой модели, кроме `claude-sonnet-4-6`. `ProtocolGeneration.model` в Postgres — `String` (`api/prisma/schema.prisma:413`), ограничений нет.
- Конфигурация воркера: `worker/src/config.ts` (Zod, `dotenv/config`) знает только REDIS_URL/LOG_LEVEL/NODE_ENV/JOB_CONCURRENCY; `KIE_API_KEY` читается напрямую из `process.env` в провайдерах. `.env.example` не содержит переменных LLM-провайдера.
- OpenRouter: `POST https://openrouter.ai/api/v1/chat/completions`, `Authorization: Bearer <OPENROUTER_API_KEY>`, OpenAI-совместимое тело `{model, messages:[{role:'system'},{role:'user'}], max_tokens, temperature?}`, ответ `choices[0].message.content`, `usage.prompt_tokens/completion_tokens`; модель `anthropic/claude-haiku-5.5` в `GET /api/v1/models` есть (контекст 1 000 000; цена 0.10/0.50 USD за 1M токенов). Ошибки: 429 и 5xx — транзиентные, 400/401/402/403/413 — постоянные; у OpenRouter тело ошибки `{error:{code,message,metadata}}`, а при недоступности upstream-провайдера возможны 502/503 и `metadata.raw`.

## 2. Объём

1. Новый адаптер `worker/src/llm/openrouter.ts`: `OpenRouterLlmProvider implements ILlmProvider` и `OpenRouterCompletionProvider implements ILlmCompletionProvider` (можно одним классом с двумя методами + тонкие обёртки), на `fetch` Node 20 без новых зависимостей. Тот же системный/пользовательский промпт, что у kie.ai (`protocol-prompt.ts`), `max_tokens` 4096 для протокола, `maxTokens` входа для completion, `responseFormat 'json'` → `response_format: {type:'json_object'}` плюс существующий `stripCodeFence`. Заголовки `HTTP-Referer: https://transcriber.itsalt.ru` и `X-Title: Transcrib` (рекомендация OpenRouter). Таймаут запроса через `AbortSignal.timeout` (по умолчанию 180 с, env `LLM_TIMEOUT_MS`) — истечение считается транзиентным.
2. Класс ошибки с той же семантикой, что `KieAiLlmError` (`status`, `reason`, `isTransient`); `isTransientLlmError` в `protocol-generation.ts` и аналогичная проверка в пайплайне памяти должны распознавать ошибки обоих провайдеров (общий базовый класс `LlmProviderError` в `worker/src/llm/errors.ts` или duck-typing по `isTransient` — выбрать и объяснить в PR). Тело ошибки в `error_msg` без ключа.
3. Выбор провайдера и модели по env, одно место: `worker/src/llm/provider.ts` с `createLlmProvider()` и `createCompletionProvider()`; `LLM_PROVIDER` = `openrouter` | `kieai` (по умолчанию `openrouter`, если задан `OPENROUTER_API_KEY`, иначе `kieai` — чтобы существующие стенды без ключа не ломались), `LLM_MODEL` — id модели провайдера (по умолчанию для openrouter `anthropic/claude-haiku-5.5`, для kieai `claude-sonnet-4-6`). Подключить в `protocol-generation.ts:325` и `worker/src/memory/index.ts:99` вместо `new KieAi…Provider()`. Переменные описать в `worker/src/config.ts` (Zod, с дефолтами) и в `.env.example` (с комментарием, без значений ключей).
4. `shared/src/llm/ILlmProvider.ts`: `LlmModel` расширить до строкового id модели провайдера (`'claude-sonnet-4-6' | 'gpt-5-4' | 'anthropic/claude-haiku-5.5' | (string & {})` или явное объединение — выбрать и объяснить), `LLM_MODEL_DEFAULT` оставить для kie.ai; в `LlmResult.model` возвращать фактический id модели из ответа провайдера (OpenRouter отдаёт `model` в ответе), чтобы `ProtocolGeneration.model` и `MemoryLlmCall`/метаданные памяти показывали реальную модель.
5. Логи: при старте воркера одна строка `llm provider: <provider> model: <model>`; на каждую ошибку — статус, транзиентность, первые 300 символов тела без ключа.
6. Ничего не менять в промптах, в классификации попыток BullMQ (TECH-026) и в контракте kie.ai; `KieAiLlmProvider` и `KieAiCompletionProvider` остаются рабочими при `LLM_PROVIDER=kieai`.

### Не входит

- merge, деплой, PROD, запись в БД
- другие модули и рабочее пространство оркестратора
- файлы вне разрешённых путей; общие пути, не объявленные выше
- подъём версий и release notes, если не перечислены выше

## 3. Критерии приёмки

1. Unit-тесты адаптера OpenRouter с подменённым `fetch` (как `kieai.test.ts`): тело запроса (model, system+user messages, max_tokens, response_format для json), заголовки (Bearer, HTTP-Referer, X-Title), маппинг ответа (text, tokensIn/tokensOut, model из ответа), пустой ответ → постоянная ошибка, 429/500/502/503 и таймаут → `isTransient=true`, 400/401/402 → `isTransient=false`; ключ не попадает в сообщение ошибки.
2. Тест фабрики провайдера: без `OPENROUTER_API_KEY` и без `LLM_PROVIDER` → kie.ai; с ключом → OpenRouter и модель `anthropic/claude-haiku-5.5`; `LLM_PROVIDER=kieai` при наличии ключа → kie.ai; неизвестный провайдер → понятная ошибка конфигурации при старте.
3. `protocol-generation` и пайплайн памяти с транзиентной ошибкой OpenRouter повторяют попытку по BullMQ (существующие тесты попыток зелёные для нового класса ошибки), с постоянной — пишут FAILED сразу.
4. Снапшот-тест промпта: отрендеренные system/user для OpenRouter байт-в-байт равны тем, что уходят в kie.ai (меняется только транспорт).
5. `pnpm -r typecheck`, `pnpm test` зелёные; `kieai.test.ts` и `kieai-completion.test.ts` без изменений поведения.
6. В PR: список переменных окружения для прода (`LLM_PROVIDER`, `LLM_MODEL`, `OPENROUTER_API_KEY`, `LLM_TIMEOUT_MS`) и что произойдёт при их отсутствии; одна живая проба в клоне не требуется (ключа у сессии нет — не запрашивать).

## 4. Порядок сдачи

- PR из `feature/wp-worker-03-openrouter-llm` в `main`; не мержить.
- Тело PR = отчёт разработки + `Deviations` (чем результат отличается от пакета и почему).
- Затем сообщение `product-coord`: `[PRODUCT] READY WP-WORKER-03 :: <sha> :: ref=<PR URL>`.

## 5. Start prompt

```text
Прочитай /home/cloudpc/projects/transcriber-orch/docs/orchestration/product/work-packages/WP-WORKER-03-openrouter-llm.md и выполни. Сначала раздел 0 (подготовка worktree). Ветка feature/wp-worker-03-openrouter-llm от origin/main, PR в main, не мержить. По готовности — сообщение product-coord: [PRODUCT] READY WP-WORKER-03 :: <sha> :: ref=<PR URL>

Before implementing, read both CLAUDE.md and AGENTS.md (including existing case variants)
and the applicable nested instruction files. Preserve all existing client-specific text.
If one file is missing or shared blocks differ, prepare confirmed common project rules and
use orch.py instructions status/sync with both expected hashes. Update both shared blocks
when a common rule changes. Do not decide contradictory existing instructions yourself:
send QUESTION with the conflict. Run orch.py instructions check --repo . before READY.
Only the module session edits its repository's instructions; the coordinator never does.

```

### Start command

Команда запуска (владельцу, в новом терминале):

```bash
cd /home/cloudpc/projects/transcriber && claude -w wp-worker-03-openrouter-llm --model sonnet --name product-worker "Прочитай /home/cloudpc/projects/transcriber-orch/docs/orchestration/product/work-packages/WP-WORKER-03-openrouter-llm.md и выполни. Сначала раздел 0 (подготовка worktree). Ветка feature/wp-worker-03-openrouter-llm от origin/main, PR в main, не мержить. По готовности — сообщение product-coord: [PRODUCT] READY WP-WORKER-03 :: <sha> :: ref=<PR URL>

Before implementing, read both CLAUDE.md and AGENTS.md (including existing case variants)
and the applicable nested instruction files. Preserve all existing client-specific text.
If one file is missing or shared blocks differ, prepare confirmed common project rules and
use orch.py instructions status/sync with both expected hashes. Update both shared blocks
when a common rule changes. Do not decide contradictory existing instructions yourself:
send QUESTION with the conflict. Run orch.py instructions check --repo . before READY.
Only the module session edits its repository's instructions; the coordinator never does.
"
```

`orch.py dispatch` добавляет к этой команде `--permission-mode` и `--settings <рабочее пространство>/orchestration/settings/<модуль>.json`: запускай сессию командой, которую печатает dispatch.

## 6. Если отказано

Сессия запускается с `--settings`, сгенерированным для её модуля командой `orch.py settings`: чтение, тесты и коммиты разрешены, push ветки пакета решает классификатор; merge, push в `main`, релизы, запуск workflow, прод и рабочее пространство оркестратора запрещены.

- Отказ правила или классификатора auto mode — это ответ: не обходить его (никаких `sh -c`, `git -C`, переименованных или скопированных команд, никакого копирования или правки файлов настроек и `.claude/`).
- Сообщение о недоступности классификатора (решение не принято) — не вердикт: повтори ту же команду позже.
- Дефект самого плагина (неверное сгенерированное правило, ошибка скрипта) оркестратор сообщает режимом `report`; плагин и его настройки не правь.
- Пришли `product-coord`: `[PRODUCT] QUESTION WP-WORKER-03 :: отказ: <точный текст отказа> :: ref=<команда>`; продолжай работу, которой это не нужно, или жди `ANSWER`.
- Ресурсы по запросу (`graph`, `dev-stack`): перед использованием пришли `product-coord`: `[PRODUCT] LOCK WP-WORKER-03 :: <ресурс> :: ref=<зачем>` и жди `ACK`; как только закончишь — `[PRODUCT] UNLOCK WP-WORKER-03 :: <ресурс> :: ref=<результат>`. READY возвращает все замки по запросу.

## Пересдачи

<Циклы REVISE: дата, пункты, коммит.>
