# WP-WORKER-05 — OpenRouter: reasoning выключен по умолчанию, лимит выхода и диагностика пустого ответа (LLM_REASONING, LLM_MAX_TOKENS)

| Поле | Значение |
|------|----------|
| Поток | worker (area) |
| Репозиторий | /home/cloudpc/projects/transcriber |
| Базовая ветка | main |
| Линия | main |
| Рабочая ветка | `feature/wp-worker-05-openrouter-reasoning` |
| Worktree | `.claude/worktrees/wp-worker-05-openrouter-reasoning` (создаёт `claude -w wp-worker-05-openrouter-reasoning`) |
| Заголовок PR | `[PRODUCT] WP-WORKER-05: OpenRouter: reasoning выключен по умолчанию, лимит выхода и диагностика пустого ответа (LLM_REASONING, LLM_MAX_TOKENS)` |
| Сессия | `product-worker` |
| Модель | `sonnet` |
| Усилие | — |
| Почему такая модель | модель реализатора по умолчанию (orch.yaml models.implement) |
| Режим | nacl: `/nacl-tl-fix` (L1: код; спецификация провайдера в заголовке адаптера) по TDD, `/nacl-tl-review`; граф не трогать |
| Команды методологии: разрешены | nacl: `nacl-tl-dev-be`, `nacl-tl-dev`, `nacl-tl-fix`, `nacl-tl-review`, `nacl-tl-regression-test`, `nacl-tl-verify-code`, `nacl-tl-sync`, `nacl-tl-docs`, `nacl-tl-stubs`, `nacl-sa-uc`, `nacl-sa-domain`, `nacl-sa-feature`, `nacl-sa-validate`, `nacl-tl-plan`, `nacl-tl-status` |
| Команды методологии: запрещены | `nacl-tl-release`, `nacl-tl-deploy`, `nacl-tl-deliver`, `nacl-tl-hotfix`, `nacl-tl-ship`, `nacl-tl-conductor`, `nacl-tl-full`, `nacl-goal`, `nacl-publish` |
| Разрешённые пути | `worker/{tsconfig.json,vitest.config.ts}`, `worker/test/**`, `worker/src/{asr,jobs,lib,llm}/**`, `worker/src/{config.ts,config.test.ts,logger.ts,shutdown.ts,shutdown.test.ts,job-processor.test.ts,queues.test.ts,queues.regression.test.ts}` |
| Общие пути, которые трогает пакет | нет; вне разрешённых путей по A-13: `.env.example` (две переменные) |
| Миграции | нет |
| Ресурсы (замки) | нет |
| Тестовая БД и порты | нет; нет |
| Слот слияния | <место в очереди слияний, задаётся при приёмке> |
| Контракт | `ILlmProvider`/`ILlmCompletionProvider` без изменений; тело запроса OpenRouter дополняется `reasoning` |
| Зависит от | WP-WORKER-04 (в main, 0f14bc7de3) |
| Размер | S |
| Спецификация | TECH-011, DEC-001; OpenRouter: параметр `reasoning` (`{enabled:false}` / `{effort:'low'|'medium'|'high'}`), `usage.completion_tokens_details.reasoning_tokens`, `choices[0].finish_reason` |
| Граф | нет |
| Решения | D-35 (reasoning по умолчанию выключен, лимит выхода, классификация пустого ответа), A-13 (`.env.example`) |

Общие пути этого репозитория (объяви те, что трогает пакет): `pnpm-lock.yaml`, `package.json`, `**/package.json`, `shared/**`, `api/prisma/**`, `.tl/{status.json,master-plan.md,changelog.md,release-status.json,deploy-plan.md}`, `.tl/external-contracts/**`, `graph-infra/**`, `config.yaml`, `CLAUDE.md`, `api/src/server.ts`, `worker/src/index.ts`, `worker/src/job-processor.ts`, `worker/src/queues.ts`, `web/src/App.tsx`, `web/src/i18n/**`.
Ресурсы этого репозитория, требующие замка: `migrations`, `graph` (по запросу: LOCK/UNLOCK, см. раздел 6), `dev-stack` (по запросу: LOCK/UNLOCK, см. раздел 6).

## 0. Подготовка worktree

1. Переключи worktree на ветку пакета: `git fetch origin && git switch -c feature/wp-worker-05-openrouter-reasoning origin/main`.
2. Подготовь worktree (команды из `orch.yaml`, выполнять внутри worktree):

   ```bash
   pnpm install --frozen-lockfile
   pnpm --filter @transcrib/api run db:generate
   ```
3. Правь только разрешённые пути; общие пути — только объявленные в шапке и после получения замка.

## 1. Факты

- Прод после WP-WORKER-04 (OpenRouter через прокси, `anthropic/claude-haiku-5.5`): протоколы встреч 12.05 (`12ced01f…`, транскрипт 60 тыс. знаков) и 20.05 (`4c390750…`) упали за ~20 с: `OpenRouter API returned an empty or missing completion text` (`protocol_generation_jobs.error_msg`, 17:30Z) — постоянная ошибка, FAILED без ретраев. Короткая встреча TCB прошла (на kie.ai).
- Воспроизведено с cloudpc тем же системным промптом (`worker/src/llm/prompts/ru/protocol-context.md`) и пользовательским сообщением 12.05 (34 441 вх. токенов): при `max_tokens: 4096` ответ `finish_reason: "length"`, `native_finish_reason: "max_tokens"`, `message.content: null`, `usage.completion_tokens_details.reasoning_tokens: 4096` — модель по умолчанию «размышляет» и тратит весь лимит на reasoning. При `max_tokens: 16000`: `finish_reason: stop`, content 4 606 знаков, reasoning 7 443 токена, 43 с. При `reasoning: {enabled: false}` и 4096: `stop`, content 5 596 знаков, reasoning 0, **12,8 с**, стоимость 0,0046 USD. При `reasoning: {effort: 'low'}` и 8192: content 4 331, reasoning 3 875, 27 с.
- Адаптер: `worker/src/llm/openrouter.ts` — `DEFAULT_MAX_TOKENS = 4096`, тело запроса `{ model, messages, max_tokens, response_format? }` (без `reasoning`); пустой/отсутствующий `content` → `OpenRouterLlmError('… empty or missing completion text', { status })` без указания причины; `finish_reason` и `completion_tokens_details` не читаются. Шаги памяти передают `maxTokens` 8192/8192/4096 (`worker/src/memory/pipeline.ts:127,185,220`).
- Конфигурация: `worker/src/config.ts` `LlmEnvSchema` (`LLM_PROVIDER`, `LLM_MODEL`, `OPENROUTER_API_KEY`, `KIE_API_KEY`, `LLM_TIMEOUT_MS`), `worker/src/llm/provider.ts` `resolveLlmSettings`/фабрики, стартовая строка `describeLlmSettings`.

## 2. Объём

1. `openrouter.ts`: в тело запроса добавлять `reasoning`: при `LLM_REASONING=off` (по умолчанию) — `{ enabled: false }`; при `low|medium|high` — `{ effort: <значение> }`. Параметр — опция конструктора `reasoning`, задаётся фабрикой из env.
2. Лимит выхода: `LLM_MAX_TOKENS` (целое ≥ 256, по умолчанию 8192) — `max_tokens` для генерации протокола; для `complete()` — `input.maxTokens ?? LLM_MAX_TOKENS`. Дефолт kie.ai (4096) не менять.
3. Диагностика: если `content` пуст и `finish_reason === 'length'` — постоянная ошибка с текстом вида `OpenRouter: max_tokens (<n>) exhausted before any content (reasoning_tokens=<k>, completion_tokens=<m>) — lower LLM_REASONING or raise LLM_MAX_TOKENS`; остальные случаи пустого контента — прежний текст плюс `finish_reason`. В `LlmResult.tokensOut` оставить `completion_tokens`; `reasoning_tokens` писать в лог (info) рядом с токенами.
4. `config.ts` (`LlmEnvSchema`: `LLM_REASONING` enum `off|low|medium|high` default `off`; `LLM_MAX_TOKENS` целое ≥ 256 default 8192), `provider.ts` (прокинуть в конструктор; стартовая строка дополняется `reasoning: off max_tokens: 8192`), `.env.example` (две переменные с пояснением про reasoning-модели).
5. Не менять: kie.ai-провайдеры, промпты, классификацию остальных ошибок, прокси.

### Не входит

- merge, деплой, PROD, запись в БД
- другие модули и рабочее пространство оркестратора
- файлы вне разрешённых путей; общие пути, не объявленные выше
- подъём версий и release notes, если не перечислены выше

## 3. Критерии приёмки

1. Тесты адаптера с подменённым `fetch`: тело содержит `reasoning: {enabled:false}` по умолчанию и `{effort:'low'}` при опции; `max_tokens` = `LLM_MAX_TOKENS` для `generate()` и `input.maxTokens` для `complete()`; ответ с `finish_reason: 'length'` и `content: null` → постоянная ошибка с `reasoning_tokens` в тексте; обычный ответ — прежний маппинг.
2. Тесты фабрики/конфига: дефолты (`off`, 8192), невалидные значения → ошибка конфигурации на старте, стартовая строка содержит `reasoning:` и `max_tokens:`.
3. `pnpm -r typecheck`, `pnpm test` зелёные; `kieai.test.ts` без изменений.
4. В PR: таблица переменных (`LLM_REASONING`, `LLM_MAX_TOKENS`) и влияние на стоимость/время (факты из раздела 1 можно цитировать). Живая проверка — оркестратором после доставки (у сессии ключа нет — не запрашивать).

## 4. Порядок сдачи

- PR из `feature/wp-worker-05-openrouter-reasoning` в `main`; не мержить.
- Тело PR = отчёт разработки + `Deviations` (чем результат отличается от пакета и почему).
- Затем сообщение `product-coord`: `[PRODUCT] READY WP-WORKER-05 :: <sha> :: ref=<PR URL>`.

## 5. Start prompt

```text
Прочитай /home/cloudpc/projects/transcriber-orch/docs/orchestration/product/work-packages/WP-WORKER-05-openrouter-reasoning.md и выполни. Сначала раздел 0 (подготовка worktree). Ветка feature/wp-worker-05-openrouter-reasoning от origin/main, PR в main, не мержить. По готовности — сообщение product-coord: [PRODUCT] READY WP-WORKER-05 :: <sha> :: ref=<PR URL>

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
cd /home/cloudpc/projects/transcriber && claude -w wp-worker-05-openrouter-reasoning --model sonnet --name product-worker "Прочитай /home/cloudpc/projects/transcriber-orch/docs/orchestration/product/work-packages/WP-WORKER-05-openrouter-reasoning.md и выполни. Сначала раздел 0 (подготовка worktree). Ветка feature/wp-worker-05-openrouter-reasoning от origin/main, PR в main, не мержить. По готовности — сообщение product-coord: [PRODUCT] READY WP-WORKER-05 :: <sha> :: ref=<PR URL>

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
- Пришли `product-coord`: `[PRODUCT] QUESTION WP-WORKER-05 :: отказ: <точный текст отказа> :: ref=<команда>`; продолжай работу, которой это не нужно, или жди `ANSWER`.
- Ресурсы по запросу (`graph`, `dev-stack`): перед использованием пришли `product-coord`: `[PRODUCT] LOCK WP-WORKER-05 :: <ресурс> :: ref=<зачем>` и жди `ACK`; как только закончишь — `[PRODUCT] UNLOCK WP-WORKER-05 :: <ресурс> :: ref=<результат>`. READY возвращает все замки по запросу.

## Пересдачи

<Циклы REVISE: дата, пункты, коммит.>
