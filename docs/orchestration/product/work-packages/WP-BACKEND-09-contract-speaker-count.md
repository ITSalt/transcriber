# WP-BACKEND-09 — Удаление колонки transcription_jobs.speaker_count (contract-шаг D-43 после WP-BACKEND-08)

| Поле | Значение |
|------|----------|
| Поток | backend (area) |
| Репозиторий | /home/cloudpc/projects/transcriber |
| Базовая ветка | main |
| Линия | main |
| Рабочая ветка | `feature/wp-backend-09-contract-speaker-count` |
| Worktree | `.claude/worktrees/wp-backend-09-contract-speaker-count` (создаёт `claude -w wp-backend-09-contract-speaker-count`) |
| Заголовок PR | `[PRODUCT] WP-BACKEND-09: Удаление колонки transcription_jobs.speaker_count (contract-шаг D-43 после WP-BACKEND-08)` |
| Сессия | `product-backend` |
| Модель | `sonnet` |
| Усилие | — |
| Почему такая модель | модель реализатора по умолчанию (orch.yaml models.implement) |
| Режим | nacl: `/nacl-tl-dev-be`, миграция по правилу `.tl/deploy-plan.md` §5 с down.sql и DB-тестом (работа уже выполнена сессией product-backend в PR #40 как contract-шаг WP-BACKEND-08; пакет заведён, потому что очередь слияний не допускает второе слияние одного пакета) |
| Команды методологии: разрешены | nacl: `nacl-tl-dev-be`, `nacl-tl-dev`, `nacl-tl-fix`, `nacl-tl-review`, `nacl-tl-regression-test`, `nacl-tl-verify-code`, `nacl-tl-sync`, `nacl-tl-docs`, `nacl-tl-stubs`, `nacl-sa-uc`, `nacl-sa-domain`, `nacl-sa-feature`, `nacl-sa-validate`, `nacl-tl-plan`, `nacl-tl-status` |
| Команды методологии: запрещены | `nacl-tl-release`, `nacl-tl-deploy`, `nacl-tl-deliver`, `nacl-tl-hotfix`, `nacl-tl-ship`, `nacl-tl-conductor`, `nacl-tl-full`, `nacl-goal`, `nacl-publish` |
| Разрешённые пути | `api/{prisma.config.ts,tsconfig.json,vitest.config.ts,README.md}`, `api/prisma/**`, `api/scripts/**`, `api/test/**`, `api/src/{config.ts,db.ts,index.ts,queue.ts,server.test.ts,prisma.smoke.test.ts,queue.test.ts,queue.regression.test.ts}`, `api/src/{lib,plugins,routes,services,sse,storage}/**`, `api/src/features/auth/**`, `api/src/features/speakers/**` |
| Общие пути, которые трогает пакет | `api/prisma/**` (схема, миграция), `.tl/{status.json,master-plan.md,changelog.md,release-status.json,deploy-plan.md}` (только deploy-plan.md §5) |
| Миграции | да: `20261009130000_drop_speaker_count` (`DROP COLUMN IF EXISTS`) + `down.sql` + DB-тест down → re-apply; деплой только после выхода кода WP-BACKEND-08 (expand/contract) |
| Ресурсы (замки) | `migrations` |
| Тестовая БД и порты | нет; нет |
| Слот слияния | <место в очереди слияний, задаётся при приёмке> |
| Контракт | нет (контракты изменены в WP-BACKEND-08) |
| Зависит от | WP-BACKEND-08 (expand-раунд на проде d6da675a03) |
| Размер | S |
| Спецификация | UC-100, ent-003 TranscriptionJob; отчёт терминологии U1, D-43 |
| Граф | нет (ent-003 без атрибута speaker_count — проверено в WP-BACKEND-08) |
| Решения | D-43, D-39 (бэкап R-22) |

Общие пути этого репозитория (объяви те, что трогает пакет): `pnpm-lock.yaml`, `package.json`, `**/package.json`, `shared/**`, `api/prisma/**`, `.tl/{status.json,master-plan.md,changelog.md,release-status.json,deploy-plan.md}`, `.tl/external-contracts/**`, `graph-infra/**`, `config.yaml`, `CLAUDE.md`, `api/src/server.ts`, `worker/src/index.ts`, `worker/src/job-processor.ts`, `worker/src/queues.ts`, `web/src/App.tsx`, `web/src/i18n/**`.
Ресурсы этого репозитория, требующие замка: `migrations`, `graph` (по запросу: LOCK/UNLOCK, см. раздел 6), `dev-stack` (по запросу: LOCK/UNLOCK, см. раздел 6).

## 0. Подготовка worktree

1. Переключи worktree на ветку пакета: `git fetch origin && git switch -c feature/wp-backend-09-contract-speaker-count origin/main`.
2. Подготовь worktree (команды из `orch.yaml`, выполнять внутри worktree):

   ```bash
   pnpm install --frozen-lockfile
   pnpm --filter @transcrib/api run db:generate
   ```
3. Правь только разрешённые пути; общие пути — только объявленные в шапке и после получения замка.

## 1. Факты

- Ревью WP-BACKEND-08 раунд 1 (`reports/wp-backend-08-review-20261009.md`): деструктивная миграция в одном деплое с кодом даёт окно между `prisma migrate deploy` (`.github/workflows/deploy-production.yml:61`) и `pm2 start` (`:104-105`), в котором старый Prisma-клиент падает на `transcription_jobs` (P2022). Решение: expand/contract — код (WP-BACKEND-08, PROD d6da675a03, verify 12:35Z), затем колонка отдельным деплоем.
- Код прода с d6da675a03 не читает `speaker_count` (api, worker, web — grep в ревью); колонка на проде ещё есть (`information_schema.columns` → 1 строка, 12:43Z).
- Бэкап БД перед миграцией снят (R-22 закрыт: `/opt/transcrib/backups/transcrib-20261009-pre-drop-speaker-count.dump`, 1 316 047 байт, 20 TABLE DATA).
- PR #40 (`feature/wp-backend-08-contract-speaker-count`, sha 432933a0e7): схема без `speakerCount`, миграция, down.sql, `api/test/drop-speaker-count.down.db.test.ts`, `.tl/deploy-plan.md` §5 — содержимое идентично проверенному рецензентом в раунде 1 WP-BACKEND-08 (DB-тесты на PG16, мутации down.sql/migration.sql пойманы).

## 2. Объём

1. Удалить поле `speakerCount` из `TranscriptionJob` в `api/prisma/schema.prisma`; миграция `20261009130000_drop_speaker_count` с `DROP COLUMN IF EXISTS`; `down.sql` (одна транзакция, идемпотентно, удаляет строку `_prisma_migrations`); DB-тест apply/down/re-apply без дрейфа; эталон `awaiting-speakers.down.db.test.ts` учитывает новую миграцию.
2. `.tl/deploy-plan.md` §5: строка отката для миграции (lost data: none) и правило: деструктивные миграции — только отдельным деплоем после выхода кода.

### Не входит

- merge, деплой, PROD, запись в БД
- другие модули и рабочее пространство оркестратора
- файлы вне разрешённых путей; общие пути, не объявленные выше
- подъём версий и release notes, если не перечислены выше

## 3. Критерии приёмки

1. CI зелёный; DB-тест `drop-speaker-count.down.db.test.ts` проходит на PG16 (клон рецензента).
2. На проде после деплоя: `SELECT count(*) FROM information_schema.columns WHERE table_name='transcription_jobs' AND column_name='speaker_count'` = 0; `_prisma_migrations` содержит `20261009130000_drop_speaker_count` с `finished_at`; api/worker online; `GET /api/meetings/:id` и `POST /api/uploads/init` работают.
3. Деплой в тихое окно: перед слиянием нет заданий распознавания/генерации, обновлённых за последний час, и встреч в UPLOADING/TRANSCRIBING/GENERATING_PROTOCOL; бэкап R-22 снят до слияния.

## 4. Порядок сдачи

- PR из `feature/wp-backend-09-contract-speaker-count` в `main`; не мержить.
- Тело PR = отчёт разработки + `Deviations` (чем результат отличается от пакета и почему).
- Затем сообщение `product-coord`: `[PRODUCT] READY WP-BACKEND-09 :: <sha> :: ref=<PR URL>`.

## 5. Start prompt

```text
Прочитай /home/cloudpc/projects/transcriber-orch/docs/orchestration/product/work-packages/WP-BACKEND-09-contract-speaker-count.md и выполни. Сначала раздел 0 (подготовка worktree). Ветка feature/wp-backend-09-contract-speaker-count от origin/main, PR в main, не мержить. По готовности — сообщение product-coord: [PRODUCT] READY WP-BACKEND-09 :: <sha> :: ref=<PR URL>

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
cd /home/cloudpc/projects/transcriber && claude -w wp-backend-09-contract-speaker-count --model sonnet --name product-backend "Прочитай /home/cloudpc/projects/transcriber-orch/docs/orchestration/product/work-packages/WP-BACKEND-09-contract-speaker-count.md и выполни. Сначала раздел 0 (подготовка worktree). Ветка feature/wp-backend-09-contract-speaker-count от origin/main, PR в main, не мержить. По готовности — сообщение product-coord: [PRODUCT] READY WP-BACKEND-09 :: <sha> :: ref=<PR URL>

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
- Пришли `product-coord`: `[PRODUCT] QUESTION WP-BACKEND-09 :: отказ: <точный текст отказа> :: ref=<команда>`; продолжай работу, которой это не нужно, или жди `ANSWER`.
- Ресурсы по запросу (`graph`, `dev-stack`): перед использованием пришли `product-coord`: `[PRODUCT] LOCK WP-BACKEND-09 :: <ресурс> :: ref=<зачем>` и жди `ACK`; как только закончишь — `[PRODUCT] UNLOCK WP-BACKEND-09 :: <ресурс> :: ref=<результат>`. READY возвращает все замки по запросу.

## Пересдачи

<Циклы REVISE: дата, пункты, коммит.>
