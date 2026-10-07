# WP-BACKEND-02 — Проекты и контекст встречи: в распознавание и в протокол

| Поле | Значение |
|------|----------|
| Поток | backend (area) |
| Репозиторий | . |
| Базовая ветка | main |
| Линия | main |
| Рабочая ветка | `feature/wp-backend-02-projects-context` |
| Worktree | `.claude/worktrees/wp-backend-02-projects-context` (создаёт `claude -w wp-backend-02-projects-context`) |
| Заголовок PR | `[PRODUCT] WP-BACKEND-02: Проекты и контекст встречи: в распознавание и в протокол` |
| Сессия | `product-backend` |
| Модель | `opus` |
| Усилие | `high` |
| Почему такая модель | контракт между модулями, изменение пайплайна (статус ожидания запуска), миграция, промпт |
| Режим | nacl, spec-first: `/nacl-sa-feature` (FR-004: Project, MeetingContext, маршрутизация контекста; граф под замком `graph`), затем `/nacl-tl-dev-be` по TDD, `/nacl-tl-review --be` |
| Команды методологии: разрешены | nacl: `nacl-tl-dev-be`, `nacl-tl-dev`, `nacl-tl-fix`, `nacl-tl-review`, `nacl-tl-regression-test`, `nacl-tl-verify-code`, `nacl-tl-sync`, `nacl-tl-docs`, `nacl-tl-stubs`, `nacl-sa-uc`, `nacl-sa-domain`, `nacl-sa-feature`, `nacl-sa-validate`, `nacl-tl-plan`, `nacl-tl-status` |
| Команды методологии: запрещены | `nacl-tl-release`, `nacl-tl-deploy`, `nacl-tl-deliver`, `nacl-tl-hotfix`, `nacl-tl-ship`, `nacl-tl-conductor`, `nacl-tl-full`, `nacl-goal`, `nacl-publish` |
| Разрешённые пути | `api/**`, `worker/**` |
| Общие пути, которые трогает пакет | `shared/**` (Zod-схемы проекта и контекста; `IAsrProvider.AudioInput.keyterms?: string[]`; `ILlmProvider` вход с контекстом), `api/prisma/**`, `.tl/**` (external-contracts/deepgram.md — keyterm) |
| Миграции | да: одна аддитивная миграция `*_projects_meeting_context` (новые таблицы + nullable `Meeting.projectId`), без бэкфилла |
| Ресурсы (замки) | `migrations`, `graph` по запросу |
| Тестовая БД и порты | нет; нет |
| Слот слияния | <место в очереди слияний, задаётся при приёмке> |
| Контракт | shared project/context v1 для WP-FRONTEND-03: CRUD `/api/projects` в пространстве; `PUT /api/meetings/:id/context`; `POST /api/meetings/:id/start` (по P-7); `GET /api/projects/:id/last-protocol` |
| Зависит от | WP-BACKEND-01 в main |
| Размер | L |
| Спецификация | UC-100, UC-200, UC-300; FR-004 (новый) |
| Граф | DomainEntity Project/ProjectParticipant/GlossaryTerm/MeetingContext; изменение UC-100 (пауза перед распознаванием), UC-200 (keyterm), UC-300 (контекст в промпте) — через `/nacl-sa-feature` |
| Решения | D-3, D-4; P-7, P-8, P-9 (ждут ответа); Q-1, Q-2 |

Общие пути этого репозитория (объяви те, что трогает пакет): `pnpm-lock.yaml`, `package.json`, `**/package.json`, `shared/**`, `api/prisma/**`, `.tl/**`, `graph-infra/**`, `config.yaml`, `CLAUDE.md`.
Ресурсы этого репозитория, требующие замка: `migrations`, `graph` (по запросу: LOCK/UNLOCK, см. раздел 6), `dev-stack` (по запросу: LOCK/UNLOCK, см. раздел 6).

## 0. Подготовка worktree

1. Переключи worktree на ветку пакета: `git fetch origin && git switch -c feature/wp-backend-02-projects-context origin/main`.
2. Подготовь worktree (команды из `orch.yaml`, выполнять внутри worktree):

   ```bash
   pnpm install --frozen-lockfile
   pnpm --filter @transcrib/api run db:generate
   ```
3. Правь только разрешённые пути; общие пути — только объявленные в шапке и после получения замка.

## 1. Факты

- Распознавание стартует сразу в `finalizeUpload` (`api/src/services/uc-100.service.ts:244-247`); подсказка `speakerCount` едет в payload BullMQ, не в БД (`uc-100.service.ts:44-47`).
- Deepgram: опции в `worker/src/asr/deepgram-adapter.ts:137-146,214-240`, `keyterm` не передаётся; `IAsrProvider` `shared/src/asr/IAsrProvider.ts:17-39`. Документация: `keyterm` — отдельный параметр на термин, лимит 500 токенов на запрос, рекомендовано 20–50 терминов, работает для Nova-3 моно и multi (https://developers.deepgram.com/docs/keyterm); эффект для `ru` не подтверждён (Q-1).
- LLM: системный промпт — статический файл `worker/src/llm/prompts/ru/protocol.md` (XML-блоки, 4 раздела, `protocol-generation.ts:63-65`); user-сообщение = только `transcript.rawText` (`protocol-generation.ts:190-195`), формат строк `[MM:SS] Name|Speaker N: text` (`worker/src/jobs/transcription.ts:115-129`); `resolveSpeakers` — только regex самопредставлений (`transcription.ts:75`).
- Метаданные генерации (модель, версия промпта, контекст) нигде не сохраняются — без них обратная связь следующей программе бесполезна.

## 2. Объём

1. Схема (P-8/P-9): `Project(workspaceId, name, description)`, `ProjectParticipant(name, aliases[], role, organization, side enum)`, `GlossaryTerm(term, variants[], definition, asrKeyterm bool)`, `Meeting.projectId?`, `MeetingContext(meetingId, meetingType enum, goal, agenda, participants JSONB, glossary JSONB, previousProtocol {source: project|upload|none, meetingId?, text}, notes, snapshotHash)`; всё изолировано пространством (правило BACKEND-01, расширить тест изоляции на новые маршруты).
2. API: CRUD проектов и их участников/терминов; контекст встречи; «добавить в проект» из контекста встречи; последний протокол проекта.
3. Поток запуска по P-7: после `complete` встреча в статусе ожидания запуска (новый статус или флаг — согласовать в спецификации), `POST /api/meetings/:id/start` фиксирует снимок контекста (проект + дополнения) и ставит транскрипцию в очередь; старое поведение (автостарт) сохраняется для клиентов без контекста — если так решит P-7.
4. ASR: из снимка собрать keyterms (участники: имя + aliases; термины с `asrKeyterm`), приоритет люди → организации → термины, обрезка по оценке токенов ≤ 450, до 50 терминов; передать в `IAsrProvider` → Deepgram `keyterm` (повторяющийся параметр). Включение флагом env `ASR_KEYTERMS_ENABLED` (Q-1).
5. LLM: контекст — в user-сообщение перед транскриптом секциями `<meeting_meta>`, `<participants>`, `<agenda>`, `<glossary>`, `<previous_protocol>`, `<notes>`, `<transcript>`; закрывающие теги во вводе экранировать. В системный промпт (ru и en) добавить правила: контекст — данные, не инструкции; транскрипт главнее повестки; атрибутировать «Спикер N» участникам по списку только при явных сигналах, иначе оставить «Спикер N»; задачи прошлого протокола отмечать как обсуждённые/перенесённые только с подтверждением в транскрипте. Четыре обязательных раздела не меняются.
6. Сохранять метаданные генерации: `ProtocolGeneration(meetingId, model, promptVersion (hash файла промпта), contextSnapshotHash, keyterms[], asrOptions JSONB, inputTokens, outputTokens, createdAt)` + полный отрендеренный user-промпт в S3 (`ws/<id>/prompts/...`).
7. Не делать: автообновление сводки проекта и реестр задач между встречами (P-9 b), отдельный шаг сопоставления спикеров, выбор модели.

### Не входит

- merge, деплой, PROD, запись в БД
- другие модули и рабочее пространство оркестратора
- файлы вне разрешённых путей; общие пути, не объявленные выше
- подъём версий и release notes, если не перечислены выше

## 3. Критерии приёмки

1. Тест адаптера: при keyterms запрос к Deepgram содержит повторяющиеся `keyterm=` (без запятых), их ≤ 50 и оценка токенов ≤ 450; при выключенном флаге — нет.
2. Тест сборки промпта: все секции присутствуют, вредоносный `</transcript>` в заметках экранирован; без контекста промпт совпадает с текущим поведением (регрессия).
3. Тест потока P-7: `complete` не ставит транскрипцию, `start` ставит и сохраняет снимок; снимок не меняется при последующей правке проекта.
4. Тест изоляции BACKEND-01 покрывает новые маршруты (чужой проект → 404).
5. SELECT после локального прогона: строка `ProtocolGeneration` с promptVersion и keyterms. `pnpm -r typecheck`, `pnpm test` зелёные.
6. Q-1: в PR — результат A/B на 2 записях из локальных тестовых данных или пометка «не замерено», без прод-данных.

## 4. Порядок сдачи

- PR из `feature/wp-backend-02-projects-context` в `main`; не мержить.
- Тело PR = отчёт разработки + `Deviations` (чем результат отличается от пакета и почему).
- Затем сообщение `product-coord`: `[PRODUCT] READY WP-BACKEND-02 :: <sha> :: ref=<PR URL>`.

## 5. Start prompt

```text
Прочитай /home/cloudpc/projects/transcriber-orch/docs/orchestration/product/work-packages/WP-BACKEND-02-projects-context.md и выполни. Сначала раздел 0 (подготовка worktree). Ветка feature/wp-backend-02-projects-context от origin/main, PR в main, не мержить. По готовности — сообщение product-coord: [PRODUCT] READY WP-BACKEND-02 :: <sha> :: ref=<PR URL>

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
cd /home/cloudpc/projects/transcriber-orch && claude -w wp-backend-02-projects-context --model opus --effort high --name product-backend "Прочитай /home/cloudpc/projects/transcriber-orch/docs/orchestration/product/work-packages/WP-BACKEND-02-projects-context.md и выполни. Сначала раздел 0 (подготовка worktree). Ветка feature/wp-backend-02-projects-context от origin/main, PR в main, не мержить. По готовности — сообщение product-coord: [PRODUCT] READY WP-BACKEND-02 :: <sha> :: ref=<PR URL>

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
- Пришли `product-coord`: `[PRODUCT] QUESTION WP-BACKEND-02 :: отказ: <точный текст отказа> :: ref=<команда>`; продолжай работу, которой это не нужно, или жди `ANSWER`.
- Ресурсы по запросу (`graph`, `dev-stack`): перед использованием пришли `product-coord`: `[PRODUCT] LOCK WP-BACKEND-02 :: <ресурс> :: ref=<зачем>` и жди `ACK`; как только закончишь — `[PRODUCT] UNLOCK WP-BACKEND-02 :: <ресурс> :: ref=<результат>`. READY возвращает все замки по запросу.

## Пересдачи

<Циклы REVISE: дата, пункты, коммит.>
