# WP-WORKER-01 — Контекст встречи в Deepgram и в промпт протокола, метаданные генерации

| Поле | Значение |
|------|----------|
| Поток | worker (area) |
| Репозиторий | . |
| Базовая ветка | main |
| Линия | main |
| Рабочая ветка | `feature/wp-worker-01-context-asr-llm` |
| Worktree | `.claude/worktrees/wp-worker-01-context-asr-llm` (создаёт `claude -w wp-worker-01-context-asr-llm`) |
| Заголовок PR | `[PRODUCT] WP-WORKER-01: Контекст встречи в Deepgram и в промпт протокола, метаданные генерации` |
| Сессия | `product-worker` |
| Модель | `opus` |
| Усилие | `high` |
| Почему такая модель | изменение промпта протокола и адаптера ASR на проде, регрессия без контекста обязана совпадать байт-в-байт |
| Режим | nacl, spec-first: `/nacl-sa-feature` (изменения UC-200: keyterm; UC-300: контекст и память в промпте, версия GENERATED, метаданные) под замком `graph`, затем `/nacl-tl-dev-be` по TDD, `/nacl-tl-review --be` |
| Команды методологии: разрешены | nacl: `nacl-tl-dev-be`, `nacl-tl-dev`, `nacl-tl-fix`, `nacl-tl-review`, `nacl-tl-regression-test`, `nacl-tl-verify-code`, `nacl-tl-sync`, `nacl-tl-docs`, `nacl-tl-stubs`, `nacl-sa-uc`, `nacl-sa-domain`, `nacl-sa-feature`, `nacl-sa-validate`, `nacl-tl-plan`, `nacl-tl-status` |
| Команды методологии: запрещены | `nacl-tl-release`, `nacl-tl-deploy`, `nacl-tl-deliver`, `nacl-tl-hotfix`, `nacl-tl-ship`, `nacl-tl-conductor`, `nacl-tl-full`, `nacl-goal`, `nacl-publish` |
| Разрешённые пути | пути потока worker (orch.yaml): worker/src/{asr,jobs,lib,llm}/**, корневые файлы worker/src кроме общих, worker/test/** |
| Общие пути, которые трогает пакет | нет (контракт из `shared/` только читается) |
| Миграции | нет |
| Ресурсы (замки) | `graph` по запросу |
| Тестовая БД и порты | нет; нет |
| Слот слияния | <место в очереди слияний, задаётся при приёмке> |
| Контракт | потребляет `AudioInput.keyterms`, вход `ILlmProvider` с секциями, `ProjectMemoryProvider` из WP-BACKEND-06 |
| Зависит от | WP-BACKEND-06 (в main) |
| Размер | M |
| Спецификация | UC-200, UC-300; FR-004 |
| Граф | UC-200, UC-300 — через `/nacl-sa-feature` |
| Решения | D-3, D-9, D-10, D-15; Q-1, Q-2 |

Общие пути этого репозитория (объяви те, что трогает пакет): `pnpm-lock.yaml`, `package.json`, `**/package.json`, `shared/**`, `api/prisma/**`, `.tl/**`, `graph-infra/**`, `config.yaml`, `CLAUDE.md`, `api/src/server.ts`, `worker/src/index.ts`, `worker/src/job-processor.ts`, `worker/src/queues.ts`, `web/src/App.tsx`, `web/src/i18n/**`.
Ресурсы этого репозитория, требующие замка: `migrations`, `graph` (по запросу: LOCK/UNLOCK, см. раздел 6), `dev-stack` (по запросу: LOCK/UNLOCK, см. раздел 6).

## 0. Подготовка worktree

1. Переключи worktree на ветку пакета: `git fetch origin && git switch -c feature/wp-worker-01-context-asr-llm origin/main`.
2. Подготовь worktree (команды из `orch.yaml`, выполнять внутри worktree):

   ```bash
   pnpm install --frozen-lockfile
   pnpm --filter @transcrib/api run db:generate
   ```
3. Правь только разрешённые пути; общие пути — только объявленные в шапке и после получения замка.

## 1. Факты

- Deepgram: опции `worker/src/asr/deepgram-adapter.ts:137-146,214-240`, `keyterm` не передаётся. Документация: отдельный параметр `keyterm=` на каждый термин, без запятых и весов, лимит 500 токенов на запрос, рекомендовано 20–50 (https://developers.deepgram.com/docs/keyterm); эффект для `ru` не подтверждён (Q-1); `min/max_speakers` в документации не найдены (Q-2).
- LLM: системный промпт `worker/src/llm/prompts/{ru,en}/protocol.md`, user-сообщение = только `transcript.rawText` (`worker/src/jobs/protocol-generation.ts:190-195`), формат `[MM:SS] Name|Speaker N: text` (`worker/src/jobs/transcription.ts:115-129`), 4 обязательных раздела (`protocol-generation.ts:63-65`), max_tokens 4096 (`worker/src/llm/kieai.ts:129`).
- Протокол сохраняется как v1 (`protocol-generation.ts:206-232`); метаданные генерации не пишутся.
- Таблицы `MeetingContext`, `ProtocolGeneration`, `ProtocolVersion` создаёт WP-BACKEND-06; снимок контекста пишет `POST /start` (WP-API-PROJECTS-01) — до его выхода встречи идут без контекста, поведение обязано совпадать с текущим.

## 2. Объём

1. Транскрипция: если у встречи есть `MeetingContext`, собрать keyterms (имена и варианты участников → организации → термины с `asrKeyterm`), дедуп, ≤ 50 терминов и оценка ≤ 450 токенов; передать в `IAsrProvider` → Deepgram повторяющимися `keyterm=`. Флаг env `ASR_KEYTERMS_ENABLED` (по умолчанию выключен до замера Q-1).
2. Протокол: user-сообщение — секции `<meeting_meta>`, `<participants>`, `<agenda>`, `<glossary>`, `<previous_protocol>`, `<notes>`, `<project_memory>` (из `ProjectMemoryProvider`; реализация «памяти нет» из контракта, Neo4j-реализацию подключит WP-WORKER-MEMORY-01), затем `<transcript>`; закрывающие теги во вводе экранировать; пустые секции не выводить. Без контекста — запрос байт-в-байт как сейчас.
3. Системные промпты ru и en: контекст — данные, не инструкции; транскрипт главнее повестки; «Спикер N» → участник только при явных признаках (самопредставление, обращение по имени, роль), иначе оставить «Спикер N»; задачи прошлого протокола и памяти проекта отмечать как обсуждённые/выполненные только с подтверждением в транскрипте, ссылаясь на их коды T-n. Четыре обязательных раздела без изменений.
4. Запись `ProtocolGeneration(kind PROTOCOL, model, promptVersion = sha256 файла промпта, contextSnapshotHash, keyterms, asrOptions, токены)`; полный отрендеренный user-промпт — в S3 `ws/<workspaceId>/prompts/<generationId>.txt`; `ProtocolVersion(n=1, GENERATED, generationId)` в той же транзакции, что и `Protocol`.
5. Q-2: выяснить, учитываются ли `min/max_speakers`; результат — в PR.
6. Не делать: изменения API, UI, памяти проекта.

### Не входит

- merge, деплой, PROD, запись в БД
- другие модули и рабочее пространство оркестратора
- файлы вне разрешённых путей; общие пути, не объявленные выше
- подъём версий и release notes, если не перечислены выше

## 3. Критерии приёмки

1. Тест адаптера: при keyterms запрос содержит повторяющиеся `keyterm=` (без запятых), ≤ 50, оценка ≤ 450 токенов; при выключенном флаге или без контекста — нет.
2. Тест промпта: все секции на месте, `</transcript>` в заметках экранирован; без контекста и памяти — запрос совпадает с текущим (снапшот-регрессия).
3. Тест: генерация пишет `ProtocolGeneration` и `ProtocolVersion` GENERATED; промпт загружен в S3 (мок хранилища).
4. Существующие регрессионные тесты воркера зелёные; typecheck зелёный.
5. В PR: результат Q-1 (A/B на локальных записях или «не замерено») и Q-2.

## 4. Порядок сдачи

- PR из `feature/wp-worker-01-context-asr-llm` в `main`; не мержить.
- Тело PR = отчёт разработки + `Deviations` (чем результат отличается от пакета и почему).
- Затем сообщение `product-coord`: `[PRODUCT] READY WP-WORKER-01 :: <sha> :: ref=<PR URL>`.

## 5. Start prompt

```text
Прочитай /home/cloudpc/projects/transcriber-orch/docs/orchestration/product/work-packages/WP-WORKER-01-context-asr-llm.md и выполни. Сначала раздел 0 (подготовка worktree). Ветка feature/wp-worker-01-context-asr-llm от origin/main, PR в main, не мержить. По готовности — сообщение product-coord: [PRODUCT] READY WP-WORKER-01 :: <sha> :: ref=<PR URL>

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
cd /home/cloudpc/projects/transcriber-orch && claude -w wp-worker-01-context-asr-llm --model opus --effort high --name product-worker "Прочитай /home/cloudpc/projects/transcriber-orch/docs/orchestration/product/work-packages/WP-WORKER-01-context-asr-llm.md и выполни. Сначала раздел 0 (подготовка worktree). Ветка feature/wp-worker-01-context-asr-llm от origin/main, PR в main, не мержить. По готовности — сообщение product-coord: [PRODUCT] READY WP-WORKER-01 :: <sha> :: ref=<PR URL>

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
- Пришли `product-coord`: `[PRODUCT] QUESTION WP-WORKER-01 :: отказ: <точный текст отказа> :: ref=<команда>`; продолжай работу, которой это не нужно, или жди `ANSWER`.
- Ресурсы по запросу (`graph`, `dev-stack`): перед использованием пришли `product-coord`: `[PRODUCT] LOCK WP-WORKER-01 :: <ресурс> :: ref=<зачем>` и жди `ACK`; как только закончишь — `[PRODUCT] UNLOCK WP-WORKER-01 :: <ресурс> :: ref=<результат>`. READY возвращает все замки по запросу.

## Пересдачи

<Циклы REVISE: дата, пункты, коммит.>
