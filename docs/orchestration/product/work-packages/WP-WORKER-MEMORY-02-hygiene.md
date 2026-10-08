# WP-WORKER-MEMORY-02 — Гигиена памяти проекта: дедуп решений, валидация исполнителей, сводка по продуктам

| Поле | Значение |
|------|----------|
| Поток | worker-memory (area) |
| Репозиторий | /home/cloudpc/projects/transcriber |
| Базовая ветка | main |
| Линия | main |
| Рабочая ветка | `feature/wp-worker-memory-02-hygiene` |
| Worktree | `.claude/worktrees/wp-worker-memory-02-hygiene` (создаёт `claude -w wp-worker-memory-02-hygiene`) |
| Заголовок PR | `[PRODUCT] WP-WORKER-MEMORY-02: Гигиена памяти проекта: дедуп решений, валидация исполнителей, сводка по продуктам` |
| Сессия | `product-worker-memory` |
| Модель | `sonnet` |
| Усилие | — |
| Почему такая модель | модель реализатора по умолчанию (orch.yaml models.implement) |
| Режим | nacl: `/nacl-tl-fix` (L1/L2: поведение шагов RESOLVE/EXTRACT; при изменении правил памяти — `/nacl-sa-feature` FR-006 под замком `graph`) по TDD, `/nacl-tl-review --be` |
| Команды методологии: разрешены | nacl: `nacl-tl-dev-be`, `nacl-tl-dev`, `nacl-tl-fix`, `nacl-tl-review`, `nacl-tl-regression-test`, `nacl-tl-verify-code`, `nacl-tl-sync`, `nacl-tl-docs`, `nacl-tl-stubs`, `nacl-sa-uc`, `nacl-sa-domain`, `nacl-sa-feature`, `nacl-sa-validate`, `nacl-tl-plan`, `nacl-tl-status` |
| Команды методологии: запрещены | `nacl-tl-release`, `nacl-tl-deploy`, `nacl-tl-deliver`, `nacl-tl-hotfix`, `nacl-tl-ship`, `nacl-tl-conductor`, `nacl-tl-full`, `nacl-goal`, `nacl-publish` |
| Разрешённые пути | `worker/src/{memory,graph}/**` |
| Общие пути, которые трогает пакет | нет (если потребуется новое поле DTO — `shared/**` объявить отдельно QUESTION) |
| Миграции | нет (граф Neo4j: при новой схеме — `graph:migrate` версия 2 с миграцией в `shared/src/memory/migrations.ts`, замок `graph`) |
| Ресурсы (замки) | `graph` по запросу |
| Тестовая БД и порты | нет; нет |
| Слот слияния | <место в очереди слияний, задаётся при приёмке> |
| Контракт | память v1 (`.tl/external-contracts/neo4j.md`) — без изменения API |
| Зависит от | нет |
| Размер | S |
| Спецификация | FR-006, UC-600..605, D-11, D-14 |
| Граф | нет |
| Решения | D-38, D-14 |

Общие пути этого репозитория (объяви те, что трогает пакет): `pnpm-lock.yaml`, `package.json`, `**/package.json`, `shared/**`, `api/prisma/**`, `.tl/{status.json,master-plan.md,changelog.md,release-status.json,deploy-plan.md}`, `.tl/external-contracts/**`, `graph-infra/**`, `config.yaml`, `CLAUDE.md`, `api/src/server.ts`, `worker/src/index.ts`, `worker/src/job-processor.ts`, `worker/src/queues.ts`, `web/src/App.tsx`, `web/src/i18n/**`.
Ресурсы этого репозитория, требующие замка: `migrations`, `graph` (по запросу: LOCK/UNLOCK, см. раздел 6), `dev-stack` (по запросу: LOCK/UNLOCK, см. раздел 6).

## 0. Подготовка worktree

1. Переключи worktree на ветку пакета: `git fetch origin && git switch -c feature/wp-worker-memory-02-hygiene origin/main`.
2. Подготовь worktree (команды из `orch.yaml`, выполнять внутри worktree):

   ```bash
   pnpm install --frozen-lockfile
   pnpm --filter @transcrib/api run db:generate
   ```
3. Правь только разрешённые пути; общие пути — только объявленные в шапке и после получения замка.

## 1. Факты

- Память проекта A после 4 встреч (`reports/feedback-analysis-20261008.md` §4 «Память проекта»): 11 решений, среди них дубли по смыслу (D-4 ≈ D-7 «подать на сертификацию в текущем виде…», D-5 ≈ D-6 «три варианта сроков / срок до 19 мая»); исполнители задач местами выдуманы или усечены (T-4 «Данил», T-3 «Хаджи», T-5 «Сергей» — Сергей в транскрипте упоминается как делающий оценки, но не участник проекта); сводка смешивает TCB и Госключ-ПК. Проект B — аккуратно (3/2).
- Шаги пайплайна: MEMORY_EXTRACT / MEMORY_RESOLVE / MEMORY_SUMMARY (`worker/src/memory/pipeline.ts:127,185,220`), гейт переходов `gate.ts`, участники проекта доступны (`project_participants`); PENDING-события — D-14.

## 2. Объём

1. RESOLVE: решения сравнивать с существующими решениями проекта — LLM получает список существующих с кодами и обязан вернуть `duplicate_of` для повторов; детерминированная страховка: нормализованное текстовое сходство (например, Jaccard по словам ≥ 0,6 или триграммы) → не создавать новое решение, а добавить упоминание к существующему (`MENTIONED_IN`).
2. Исполнитель задачи: принимается только если совпадает с участником проекта (имя/алиас, без падежей) или с именем из `speaker_map`; иначе `assignee` = null и событие PENDING с цитатой «исполнитель: <как сказано>» (пользователь подтверждает). Усечённые/придуманные имена исчезают.
3. Сводка: группировать по продуктам/темам из глоссария проекта (термины с пометкой «продукт» в определении) — если просто, иначе отложить с QUESTION.
4. Фикстура двух встреч (та же, что в WP-WORKER-MEMORY-01) дополняется повтором решения и задачей с неизвестным исполнителем.

### Не входит

- merge, деплой, PROD, запись в БД
- другие модули и рабочее пространство оркестратора
- файлы вне разрешённых путей; общие пути, не объявленные выше
- подъём версий и release notes, если не перечислены выше

## 3. Критерии приёмки

1. Тест: повторное решение с другой формулировкой не создаёт D-n, а добавляет упоминание; порог и нормализация описаны.
2. Тест: исполнитель вне участников → assignee null + PENDING с цитатой; участник по алиасу → назначен.
3. Neo4j-тест пайплайна (CI) зелёный; `pnpm -r typecheck`, `pnpm test` зелёные.
4. В PR: что будет с уже накопленными дублями в проде (ничего — только новые встречи; чистка существующих — через очередь подтверждений/ручное объединение дублей, D-14).

## 4. Порядок сдачи

- PR из `feature/wp-worker-memory-02-hygiene` в `main`; не мержить.
- Тело PR = отчёт разработки + `Deviations` (чем результат отличается от пакета и почему).
- Затем сообщение `product-coord`: `[PRODUCT] READY WP-WORKER-MEMORY-02 :: <sha> :: ref=<PR URL>`.

## 5. Start prompt

```text
Прочитай /home/cloudpc/projects/transcriber-orch/docs/orchestration/product/work-packages/WP-WORKER-MEMORY-02-hygiene.md и выполни. Сначала раздел 0 (подготовка worktree). Ветка feature/wp-worker-memory-02-hygiene от origin/main, PR в main, не мержить. По готовности — сообщение product-coord: [PRODUCT] READY WP-WORKER-MEMORY-02 :: <sha> :: ref=<PR URL>

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
cd /home/cloudpc/projects/transcriber && claude -w wp-worker-memory-02-hygiene --model sonnet --name product-worker-memory "Прочитай /home/cloudpc/projects/transcriber-orch/docs/orchestration/product/work-packages/WP-WORKER-MEMORY-02-hygiene.md и выполни. Сначала раздел 0 (подготовка worktree). Ветка feature/wp-worker-memory-02-hygiene от origin/main, PR в main, не мержить. По готовности — сообщение product-coord: [PRODUCT] READY WP-WORKER-MEMORY-02 :: <sha> :: ref=<PR URL>

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
- Пришли `product-coord`: `[PRODUCT] QUESTION WP-WORKER-MEMORY-02 :: отказ: <точный текст отказа> :: ref=<команда>`; продолжай работу, которой это не нужно, или жди `ANSWER`.
- Ресурсы по запросу (`graph`, `dev-stack`): перед использованием пришли `product-coord`: `[PRODUCT] LOCK WP-WORKER-MEMORY-02 :: <ресурс> :: ref=<зачем>` и жди `ACK`; как только закончишь — `[PRODUCT] UNLOCK WP-WORKER-MEMORY-02 :: <ресурс> :: ref=<результат>`. READY возвращает все замки по запросу.

## Пересдачи

<Циклы REVISE: дата, пункты, коммит.>
