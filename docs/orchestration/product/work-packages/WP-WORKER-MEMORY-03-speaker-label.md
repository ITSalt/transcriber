# WP-WORKER-MEMORY-03 — Метка спикера в цитатах памяти: «Спикер N»

| Поле | Значение |
|------|----------|
| Поток | worker-memory (area) |
| Репозиторий | /home/cloudpc/projects/transcriber |
| Базовая ветка | main |
| Линия | main |
| Рабочая ветка | `feature/wp-worker-memory-03-speaker-label` |
| Worktree | `.claude/worktrees/wp-worker-memory-03-speaker-label` (создаёт `claude -w wp-worker-memory-03-speaker-label`) |
| Заголовок PR | `[PRODUCT] WP-WORKER-MEMORY-03: Метка спикера в цитатах памяти: «Спикер N»` |
| Сессия | `product-worker-memory` |
| Модель | `sonnet` |
| Усилие | — |
| Почему такая модель | модель реализатора по умолчанию (orch.yaml models.implement) |
| Режим | nacl: `/nacl-tl-dev-be` (одна функция + тесты) |
| Команды методологии: разрешены | nacl: `nacl-tl-dev-be`, `nacl-tl-dev`, `nacl-tl-fix`, `nacl-tl-review`, `nacl-tl-regression-test`, `nacl-tl-verify-code`, `nacl-tl-sync`, `nacl-tl-docs`, `nacl-tl-stubs`, `nacl-sa-uc`, `nacl-sa-domain`, `nacl-sa-feature`, `nacl-sa-validate`, `nacl-tl-plan`, `nacl-tl-status` |
| Команды методологии: запрещены | `nacl-tl-release`, `nacl-tl-deploy`, `nacl-tl-deliver`, `nacl-tl-hotfix`, `nacl-tl-ship`, `nacl-tl-conductor`, `nacl-tl-full`, `nacl-goal`, `nacl-publish` |
| Разрешённые пути | `worker/src/{memory,graph}/**` |
| Общие пути, которые трогает пакет | нет |
| Миграции | нет |
| Ресурсы (замки) | нет |
| Тестовая БД и порты | нет; нет |
| Слот слияния | <место в очереди слияний, задаётся при приёмке> |
| Контракт | нет |
| Зависит от | нет |
| Размер | S |
| Спецификация | UC-600, UC-601 (цитаты упоминаний: `speakerLabel`) |
| Граф | нет |
| Решения | D-41 |

Общие пути этого репозитория (объяви те, что трогает пакет): `pnpm-lock.yaml`, `package.json`, `**/package.json`, `shared/**`, `api/prisma/**`, `.tl/{status.json,master-plan.md,changelog.md,release-status.json,deploy-plan.md}`, `.tl/external-contracts/**`, `graph-infra/**`, `config.yaml`, `CLAUDE.md`, `api/src/server.ts`, `worker/src/index.ts`, `worker/src/job-processor.ts`, `worker/src/queues.ts`, `web/src/App.tsx`, `web/src/i18n/**`.
Ресурсы этого репозитория, требующие замка: `migrations`, `graph` (по запросу: LOCK/UNLOCK, см. раздел 6), `dev-stack` (по запросу: LOCK/UNLOCK, см. раздел 6).

## 0. Подготовка worktree

1. Переключи worktree на ветку пакета: `git fetch origin && git switch -c feature/wp-worker-memory-03-speaker-label origin/main`.
2. Подготовь worktree (команды из `orch.yaml`, выполнять внутри worktree):

   ```bash
   pnpm install --frozen-lockfile
   pnpm --filter @transcrib/api run db:generate
   ```
3. Правь только разрешённые пути; общие пути — только объявленные в шапке и после получения замка.

## 1. Факты

- Ревизия терминологии 2026-10-09 (`reports/terminology-audit-20261009.md`): владелец отменил A-2 («задача в UI = Meeting»). Словарь: «встреча» — то, что загружаем (Meeting); «поручение» — задание участнику встречи с контекстом и сроком (реестр проекта T-n, секция протокола); слово «задача» в продукте не используется ни в одном значении; фоновые работы — «обработка»; метка неподтверждённого спикера — «Спикер N» как в транскрипте (D-40, D-41, D-42). Идентификаторы кода (`Task`, `/api/projects/:id/tasks`, `T-n`, `SPEAKER_n`) не меняются.
- Код уже говорит правильно: `Meeting`/`/api/meetings`, `/api/projects/:projectId/tasks`, секции протокола `['## Участники','## Обсуждение','## Решения','## Задачи']` (`worker/src/jobs/protocol-generation.ts:85`). Расхождение живёт в строках интерфейса, промптах, тестах и графе спецификации.
- `worker/src/memory/transcript.ts:47` формирует подпись спикера для цитат памяти: `Speaker ${n+1}`; она попадает в `MENTIONED_IN.speakerLabel` и показывается в истории поручения (`web/src/features/memory/components/TaskDetail.tsx`). По D-41 — «Спикер N» (RU) / «Speaker N» (EN) по языку встречи; подтверждённые имена (`speaker_mapping`) уже подставляются.
- Если память разбирает секцию протокола «## Задачи» (поиск `grep -n "Задач" worker/src/memory`), после WP-WORKER-08 секция называется «## Поручения» — принимать оба заголовка.

## 2. Объём

1. `transcript.ts`: метка неподтверждённого спикера «Спикер N» для RU, «Speaker N» для EN (язык из данных встречи/транскрипта, как в WP-WORKER-08 — согласовать общую функцию, если она в `worker/src/lib` (не в области: тогда импортировать после слияния WP-WORKER-08 или продублировать локально с тестом).
2. Разбор протокола в памяти (если есть): принимать «## Задачи» и «## Поручения».
3. Тесты на оба языка и оба заголовка.

### Не входит

- merge, деплой, PROD, запись в БД
- другие модули и рабочее пространство оркестратора
- файлы вне разрешённых путей; общие пути, не объявленные выше
- подъём версий и release notes, если не перечислены выше

## 3. Критерии приёмки

1. `pnpm --filter @transcrib/worker test`, `pnpm -r typecheck` зелёные; тест цитаты для RU ожидает «Спикер 2».
2. На проде после доставки: новая встреча с проектом → `MATCH (m:Task)-[r:MENTIONED_IN]->() RETURN r.speakerLabel` для новых упоминаний без «Speaker» (read-only запрос оркестратора к Neo4j памяти).

## 4. Порядок сдачи

- PR из `feature/wp-worker-memory-03-speaker-label` в `main`; не мержить.
- Тело PR = отчёт разработки + `Deviations` (чем результат отличается от пакета и почему).
- Затем сообщение `product-coord`: `[PRODUCT] READY WP-WORKER-MEMORY-03 :: <sha> :: ref=<PR URL>`.

## 5. Start prompt

```text
Прочитай /home/cloudpc/projects/transcriber-orch/docs/orchestration/product/work-packages/WP-WORKER-MEMORY-03-speaker-label.md и выполни. Сначала раздел 0 (подготовка worktree). Ветка feature/wp-worker-memory-03-speaker-label от origin/main, PR в main, не мержить. По готовности — сообщение product-coord: [PRODUCT] READY WP-WORKER-MEMORY-03 :: <sha> :: ref=<PR URL>

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
cd /home/cloudpc/projects/transcriber && claude -w wp-worker-memory-03-speaker-label --model sonnet --name product-worker-memory "Прочитай /home/cloudpc/projects/transcriber-orch/docs/orchestration/product/work-packages/WP-WORKER-MEMORY-03-speaker-label.md и выполни. Сначала раздел 0 (подготовка worktree). Ветка feature/wp-worker-memory-03-speaker-label от origin/main, PR в main, не мержить. По готовности — сообщение product-coord: [PRODUCT] READY WP-WORKER-MEMORY-03 :: <sha> :: ref=<PR URL>

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
- Пришли `product-coord`: `[PRODUCT] QUESTION WP-WORKER-MEMORY-03 :: отказ: <точный текст отказа> :: ref=<команда>`; продолжай работу, которой это не нужно, или жди `ANSWER`.
- Ресурсы по запросу (`graph`, `dev-stack`): перед использованием пришли `product-coord`: `[PRODUCT] LOCK WP-WORKER-MEMORY-03 :: <ресурс> :: ref=<зачем>` и жди `ACK`; как только закончишь — `[PRODUCT] UNLOCK WP-WORKER-MEMORY-03 :: <ресурс> :: ref=<результат>`. READY возвращает все замки по запросу.

## Пересдачи

<Циклы REVISE: дата, пункты, коммит.>
