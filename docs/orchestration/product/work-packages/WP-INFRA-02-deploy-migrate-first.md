# WP-INFRA-02 — Порядок деплоя: миграции Postgres до сборки и замены dist

| Поле | Значение |
|------|----------|
| Поток | infra (area) |
| Репозиторий | /home/cloudpc/projects/transcriber |
| Базовая ветка | main |
| Линия | main |
| Рабочая ветка | `feature/wp-infra-02-deploy-migrate-first` |
| Worktree | `.claude/worktrees/wp-infra-02-deploy-migrate-first` (создаёт `claude -w wp-infra-02-deploy-migrate-first`) |
| Заголовок PR | `[PRODUCT] WP-INFRA-02: Порядок деплоя: миграции Postgres до сборки и замены dist` |
| Сессия | `product-infra` |
| Модель | `sonnet` |
| Усилие | — |
| Почему такая модель | модель реализатора по умолчанию (orch.yaml models.implement) |
| Режим | <методология, по которой работает сессия в своём репозитории> |
| Команды методологии: разрешены | nacl: `nacl-tl-dev-be`, `nacl-tl-dev`, `nacl-tl-fix`, `nacl-tl-review`, `nacl-tl-regression-test`, `nacl-tl-verify-code`, `nacl-tl-sync`, `nacl-tl-docs`, `nacl-tl-stubs`, `nacl-sa-uc`, `nacl-sa-domain`, `nacl-sa-feature`, `nacl-sa-validate`, `nacl-tl-plan`, `nacl-tl-status` |
| Команды методологии: запрещены | `nacl-tl-release`, `nacl-tl-deploy`, `nacl-tl-deliver`, `nacl-tl-hotfix`, `nacl-tl-ship`, `nacl-tl-conductor`, `nacl-tl-full`, `nacl-goal`, `nacl-publish` |
| Разрешённые пути | `docker-compose.yml`, `.github/**`, `scripts/**`, `.env.example` |
| Общие пути, которые трогает пакет | нет |
| Миграции | нет |
| Ресурсы (замки) | <ресурсы в обратных кавычках из списка ниже, или нет> |
| Тестовая БД и порты | нет; нет |
| Слот слияния | <место в очереди слияний, задаётся при приёмке> |
| Контракт | <версия контракта или нет> |
| Зависит от | нет (WP-INFRA-01 в main). Доставка: до merge WP-BACKEND-06 |
| Размер | XS |
| Спецификация | нет |
| Граф | нет |
| Решения | <D-n, на которые опирается пакет, или нет> |

Общие пути этого репозитория (объяви те, что трогает пакет): `pnpm-lock.yaml`, `package.json`, `**/package.json`, `shared/**`, `api/prisma/**`, `.tl/{status.json,master-plan.md,changelog.md,release-status.json,deploy-plan.md}`, `.tl/external-contracts/**`, `graph-infra/**`, `config.yaml`, `CLAUDE.md`, `api/src/server.ts`, `worker/src/index.ts`, `worker/src/job-processor.ts`, `worker/src/queues.ts`, `web/src/App.tsx`, `web/src/i18n/**`.
Ресурсы этого репозитория, требующие замка: `migrations`, `graph` (по запросу: LOCK/UNLOCK, см. раздел 6), `dev-stack` (по запросу: LOCK/UNLOCK, см. раздел 6).

## 0. Подготовка worktree

1. Переключи worktree на ветку пакета: `git fetch origin && git switch -c feature/wp-infra-02-deploy-migrate-first origin/main`.
2. Подготовь worktree (команды из `orch.yaml`, выполнять внутри worktree):

   ```bash
   pnpm install --frozen-lockfile
   pnpm --filter @transcrib/api run db:generate
   ```
3. Правь только разрешённые пути; общие пути — только объявленные в шапке и после получения замка.

## 1. Факты

- `.github/workflows/deploy-production.yml:49-58` (main `9e5d534`): порядок шагов на VM — `pnpm install` → `db:generate` → сборки `shared`, `api`, `worker`, `web` (заменяют `dist/` на диске) → **только потом** `db:migrate:deploy` → rsync фронта → перезапуск pm2.
- `ecosystem.config.cjs` (прод): процессы api/worker под pm2 с `max_memory_restart` (512M/1024M) — pm2 может перезапустить процесс в любой момент, в том числе между заменой `dist/` и миграцией; тогда стартует новый код на старой схеме. Упавшая миграция (`set -e`, строка 39) обрывает деплой, но новый `dist/` уже лежит на диске — следующий любой рестарт тоже поднимет новый код на старой схеме.
- WP-BACKEND-06 (контракт программы) добавляет колонки и бэкфиллы (например `meetings.workspace_id`); новый Prisma-клиент выбирает их в каждом запросе встреч → `column does not exist`. Найдено сессией product-backend при внутреннем ревью 2026-10-07 (QUESTION WP-BACKEND-06).
- D-3: миграции программы — только аддитивные/обратимые, совместимые со старым кодом; значит, миграцию безопасно применять ДО замены кода, а не после.
- Шаг `graph:migrate` (WP-INFRA-01, строки 60-82) должен остаться после сборки `worker` (скрипт может требовать собранный `dist`).

## 2. Объём

1. В `.github/workflows/deploy-production.yml` перенести `pnpm --filter @transcrib/api run db:migrate:deploy` сразу после `pnpm --filter @transcrib/api run db:generate`, до сборок `shared/api/worker/web`. Комментарий в workflow: почему миграция идёт до замены `dist/` (окно pm2-рестарта; упавшая миграция оставляет старый код на диске).
2. Шаг `graph:migrate` не двигать (остаётся после сборок, до rsync).
3. Текст подсказки отката в шаге «Notify on failure» (строка ~105): добавить, что при упавшей миграции код на диске не менялся и откат кода не нужен.
4. Не делать: любые другие изменения workflow, `ci.yml`, compose, скриптов.

### Не входит

- merge, деплой, PROD, запись в БД
- другие модули и рабочее пространство оркестратора
- файлы вне разрешённых путей; общие пути, не объявленные выше
- подъём версий и release notes, если не перечислены выше

## 3. Критерии приёмки

1. В диффе PR `db:migrate:deploy` стоит между `db:generate` и первой сборкой; `graph:migrate` остался после сборки `worker`; больше ничего в ssh-блоке не переставлено (в PR — `git diff` с нумерацией строк).
2. Workflow разбирается (`actionlint`, если есть, иначе YAML-парсер) и ssh-блок проходит `bash -n` как скрипт (извлечь heredoc и проверить).
3. После merge — зелёный Deploy to Production и health-check (проверяет оркестратор): порядок шагов в логе — migrate до build.

## 4. Порядок сдачи

- PR из `feature/wp-infra-02-deploy-migrate-first` в `main`; не мержить.
- Тело PR = отчёт разработки + `Deviations` (чем результат отличается от пакета и почему).
- Затем сообщение `product-coord`: `[PRODUCT] READY WP-INFRA-02 :: <sha> :: ref=<PR URL>`.

## 5. Start prompt

```text
Прочитай /home/cloudpc/projects/transcriber-orch/docs/orchestration/product/work-packages/WP-INFRA-02-deploy-migrate-first.md и выполни. Сначала раздел 0 (подготовка worktree). Ветка feature/wp-infra-02-deploy-migrate-first от origin/main, PR в main, не мержить. По готовности — сообщение product-coord: [PRODUCT] READY WP-INFRA-02 :: <sha> :: ref=<PR URL>

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
cd /home/cloudpc/projects/transcriber && claude -w wp-infra-02-deploy-migrate-first --model sonnet --name product-infra "Прочитай /home/cloudpc/projects/transcriber-orch/docs/orchestration/product/work-packages/WP-INFRA-02-deploy-migrate-first.md и выполни. Сначала раздел 0 (подготовка worktree). Ветка feature/wp-infra-02-deploy-migrate-first от origin/main, PR в main, не мержить. По готовности — сообщение product-coord: [PRODUCT] READY WP-INFRA-02 :: <sha> :: ref=<PR URL>

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
- Пришли `product-coord`: `[PRODUCT] QUESTION WP-INFRA-02 :: отказ: <точный текст отказа> :: ref=<команда>`; продолжай работу, которой это не нужно, или жди `ANSWER`.
- Ресурсы по запросу (`graph`, `dev-stack`): перед использованием пришли `product-coord`: `[PRODUCT] LOCK WP-INFRA-02 :: <ресурс> :: ref=<зачем>` и жди `ACK`; как только закончишь — `[PRODUCT] UNLOCK WP-INFRA-02 :: <ресурс> :: ref=<результат>`. READY возвращает все замки по запросу.

## Пересдачи

<Циклы REVISE: дата, пункты, коммит.>
