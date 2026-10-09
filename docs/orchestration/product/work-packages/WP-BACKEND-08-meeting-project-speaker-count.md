# WP-BACKEND-08 — Проект в карточке встречи; удаление speaker_count из контрактов, сервисов и БД

| Поле | Значение |
|------|----------|
| Поток | backend (area) |
| Репозиторий | /home/cloudpc/projects/transcriber |
| Базовая ветка | main |
| Линия | main |
| Рабочая ветка | `feature/wp-backend-08-meeting-project-speaker-count` |
| Worktree | `.claude/worktrees/wp-backend-08-meeting-project-speaker-count` (создаёт `claude -w wp-backend-08-meeting-project-speaker-count`) |
| Заголовок PR | `[PRODUCT] WP-BACKEND-08: Проект в карточке встречи; удаление speaker_count из контрактов, сервисов и БД` |
| Сессия | `product-backend` |
| Модель | `sonnet` |
| Усилие | — |
| Почему такая модель | модель реализатора по умолчанию (orch.yaml models.implement) |
| Режим | nacl: `/nacl-sa-uc` (UC-002: проект в карточке; UC-100: поле удалено) под замком `graph`, `/nacl-tl-dev-be` по TDD, миграция по правилу `.tl/deploy-plan.md` §5 с down.sql и DB-тестом |
| Команды методологии: разрешены | nacl: `nacl-tl-dev-be`, `nacl-tl-dev`, `nacl-tl-fix`, `nacl-tl-review`, `nacl-tl-regression-test`, `nacl-tl-verify-code`, `nacl-tl-sync`, `nacl-tl-docs`, `nacl-tl-stubs`, `nacl-sa-uc`, `nacl-sa-domain`, `nacl-sa-feature`, `nacl-sa-validate`, `nacl-tl-plan`, `nacl-tl-status` |
| Команды методологии: запрещены | `nacl-tl-release`, `nacl-tl-deploy`, `nacl-tl-deliver`, `nacl-tl-hotfix`, `nacl-tl-ship`, `nacl-tl-conductor`, `nacl-tl-full`, `nacl-goal`, `nacl-publish` |
| Разрешённые пути | `api/{prisma.config.ts,tsconfig.json,vitest.config.ts,README.md}`, `api/prisma/**`, `api/scripts/**`, `api/test/**`, `api/src/{config.ts,db.ts,index.ts,queue.ts,server.test.ts,prisma.smoke.test.ts,queue.test.ts,queue.regression.test.ts}`, `api/src/{lib,plugins,routes,services,sse,storage}/**`, `api/src/features/auth/**`, `api/src/features/speakers/**` |
| Общие пути, которые трогает пакет | `shared/**` (`shared/src/api/uc002.ts` — `project_id`/`project_name` в `MeetingDetail`; `shared/src/api/uc100.ts:94`, `shared/src/api/uc200.ts:11` — удалить `speaker_count`), `api/prisma/**` (миграция) |
| Миграции | да: одна миграция `DROP COLUMN transcription_jobs.speaker_count` + `down.sql` (ADD COLUMN INT NULL); номер по времени после последней в main; DB-тест down/re-apply по образцу `api/test/program-schema.down.db.test.ts` |
| Ресурсы (замки) | `migrations`, `graph` по запросу |
| Тестовая БД и порты | нет; нет |
| Слот слияния | <место в очереди слияний, задаётся при приёмке> |
| Контракт | меняет `MeetingDetail` (+`project_id: uuid|null`, +`project_name: string|null`) — потребляет WP-FRONTEND-08; удаляет `speaker_count` из `UploadInit`/`TranscriptionJobPayload` — к этому моменту web (WP-WEB-PROJECTS-02) и worker (WP-WORKER-08) его не используют |
| Зависит от | WP-WORKER-08, WP-WEB-PROJECTS-02 (оба в main) |
| Размер | M |
| Спецификация | UC-002, UC-100, UC-004, UC-503; отчёт U4, D-43 |
| Граф | UC-002 (поле проекта в карточке), UC-100/FORM-MeetingUpload (поле удалено, если WP-SPEC-01 ещё не сделал), ent-003 TranscriptionJob (атрибут speaker_count удалить) |
| Решения | D-42, D-43, D-21, D-7 |

Общие пути этого репозитория (объяви те, что трогает пакет): `pnpm-lock.yaml`, `package.json`, `**/package.json`, `shared/**`, `api/prisma/**`, `.tl/{status.json,master-plan.md,changelog.md,release-status.json,deploy-plan.md}`, `.tl/external-contracts/**`, `graph-infra/**`, `config.yaml`, `CLAUDE.md`, `api/src/server.ts`, `worker/src/index.ts`, `worker/src/job-processor.ts`, `worker/src/queues.ts`, `web/src/App.tsx`, `web/src/i18n/**`.
Ресурсы этого репозитория, требующие замка: `migrations`, `graph` (по запросу: LOCK/UNLOCK, см. раздел 6), `dev-stack` (по запросу: LOCK/UNLOCK, см. раздел 6).

## 0. Подготовка worktree

1. Переключи worktree на ветку пакета: `git fetch origin && git switch -c feature/wp-backend-08-meeting-project-speaker-count origin/main`.
2. Подготовь worktree (команды из `orch.yaml`, выполнять внутри worktree):

   ```bash
   pnpm install --frozen-lockfile
   pnpm --filter @transcrib/api run db:generate
   ```
3. Правь только разрешённые пути; общие пути — только объявленные в шапке и после получения замка.

## 1. Факты

- Ревизия терминологии 2026-10-09 (`reports/terminology-audit-20261009.md`): владелец отменил A-2 («задача в UI = Meeting»). Словарь: «встреча» — то, что загружаем (Meeting); «поручение» — задание участнику встречи с контекстом и сроком (реестр проекта T-n, секция протокола); слово «задача» в продукте не используется ни в одном значении; фоновые работы — «обработка»; метка неподтверждённого спикера — «Спикер N» как в транскрипте (D-40, D-41, D-42). Идентификаторы кода (`Task`, `/api/projects/:id/tasks`, `T-n`, `SPEAKER_n`) не меняются.
- Код уже говорит правильно: `Meeting`/`/api/meetings`, `/api/projects/:projectId/tasks`, секции протокола `['## Участники','## Обсуждение','## Решения','## Задачи']` (`worker/src/jobs/protocol-generation.ts:85`). Расхождение живёт в строках интерфейса, промптах, тестах и графе спецификации.
- `MeetingDetail` (`shared/src/api/uc002.ts`) не содержит проекта (`grep -n project shared/src/api/uc002.ts` пуст); `Meeting.project_id` есть в Prisma (`api/prisma/schema.prisma`, модель Meeting, FR-004) и в списке (`WorkspaceMeetingListItem.project_id/project_name`, `shared/src/api/workspace.ts:34-39`). Сервис карточки — `api/src/services/uc-002.service.ts` (проверить имя), маршрут `GET /api/meetings/:id`.
- `speaker_count`: контракт `uc100.ts:94` (`UploadInit.speaker_count`), `uc200.ts:11` (полезная нагрузка задания), `api/src/services/uc-100.service.ts:47,54,145,235,265`, `api/src/features/context/service.ts:127,142,207,214` (модуль api-projects — вне области: сообщи QUESTION, если правка там необходима; ожидается, что после удаления поля из типа достаточно убрать его из `select`/передачи — оркестратор выдаст замок на `api/src/features/context/service.ts` через LOCK), `api/src/services/uc-004.service.ts:196`, колонка `schema.prisma:172-173` `speakerCount Int? @map("speaker_count")` с комментарием «NULL = auto-detect». Значение нигде не используется (D-21, D-43).
- Воркер (WP-WORKER-08) и форма (WP-WEB-PROJECTS-02) к моменту этого пакета поле не читают и не шлют.

## 2. Объём

1. `MeetingDetail` += `project_id`, `project_name` (nullable); сервис UC-002 отдаёт их (join Project в пространстве вызывающего); тесты маршрута.
2. Удалить `speaker_count` end-to-end в api и shared: `UploadInit` (uc100), полезная нагрузка задания (uc200), сервисы UC-100, UC-004, context (см. факты про область), `enqueue`-вызовы; Prisma: поле `speakerCount` из модели `TranscriptionJob` + миграция `DROP COLUMN` с `down.sql` и DB-тестом; обновить `.tl/external-contracts/deepgram.md`, если упоминает число спикеров.
3. Входящие запросы со старым полем `speaker_count` (кэш SPA): Zod по умолчанию strip — проверить, что `POST /api/uploads/init` с лишним полем отвечает 200 (тест), а не 400.
4. UC-002/UC-100 в графе через `/nacl-sa-uc`: проект в карточке; поле количества спикеров удалено из формы загрузки (согласовать с WP-SPEC-01 через QUESTION, чтобы не править одно и то же дважды).

### Не входит

- merge, деплой, PROD, запись в БД
- другие модули и рабочее пространство оркестратора
- файлы вне разрешённых путей; общие пути, не объявленные выше
- подъём версий и release notes, если не перечислены выше

## 3. Критерии приёмки

1. `grep -rn "speaker_count\|speakerCount" api/src shared/src worker/src web/src` пуст (кроме миграции и down.sql).
2. `pnpm -r typecheck`, `pnpm test` зелёные; DB-тест миграции down → re-apply проходит на локальном PG.
3. На проде после доставки: `SELECT column_name FROM information_schema.columns WHERE table_name='transcription_jobs' AND column_name='speaker_count'` → 0 строк; `GET /api/meetings/<встреча проекта>` содержит `project_id` и `project_name`; загрузка новой встречи и старт распознавания работают (живой сценарий оркестратора на пользователе «Тест»).
4. Бэкап БД перед миграцией — оркестратор по D-39 (R-n на себя).

## 4. Порядок сдачи

- PR из `feature/wp-backend-08-meeting-project-speaker-count` в `main`; не мержить.
- Тело PR = отчёт разработки + `Deviations` (чем результат отличается от пакета и почему).
- Затем сообщение `product-coord`: `[PRODUCT] READY WP-BACKEND-08 :: <sha> :: ref=<PR URL>`.

## 5. Start prompt

```text
Прочитай /home/cloudpc/projects/transcriber-orch/docs/orchestration/product/work-packages/WP-BACKEND-08-meeting-project-speaker-count.md и выполни. Сначала раздел 0 (подготовка worktree). Ветка feature/wp-backend-08-meeting-project-speaker-count от origin/main, PR в main, не мержить. По готовности — сообщение product-coord: [PRODUCT] READY WP-BACKEND-08 :: <sha> :: ref=<PR URL>

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
cd /home/cloudpc/projects/transcriber && claude -w wp-backend-08-meeting-project-speaker-count --model sonnet --name product-backend "Прочитай /home/cloudpc/projects/transcriber-orch/docs/orchestration/product/work-packages/WP-BACKEND-08-meeting-project-speaker-count.md и выполни. Сначала раздел 0 (подготовка worktree). Ветка feature/wp-backend-08-meeting-project-speaker-count от origin/main, PR в main, не мержить. По готовности — сообщение product-coord: [PRODUCT] READY WP-BACKEND-08 :: <sha> :: ref=<PR URL>

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
- Пришли `product-coord`: `[PRODUCT] QUESTION WP-BACKEND-08 :: отказ: <точный текст отказа> :: ref=<команда>`; продолжай работу, которой это не нужно, или жди `ANSWER`.
- Ресурсы по запросу (`graph`, `dev-stack`): перед использованием пришли `product-coord`: `[PRODUCT] LOCK WP-BACKEND-08 :: <ресурс> :: ref=<зачем>` и жди `ACK`; как только закончишь — `[PRODUCT] UNLOCK WP-BACKEND-08 :: <ресурс> :: ref=<результат>`. READY возвращает все замки по запросу.

## Пересдачи

<Циклы REVISE: дата, пункты, коммит.>
