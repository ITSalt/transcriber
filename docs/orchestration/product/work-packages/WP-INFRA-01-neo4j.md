# WP-INFRA-01 — Neo4j памяти проекта: сервис, лимиты, бэкап, CI, шаг деплоя

| Поле | Значение |
|------|----------|
| Поток | infra (area) |
| Репозиторий | . |
| Базовая ветка | main |
| Линия | main |
| Рабочая ветка | `feature/wp-infra-01-neo4j` |
| Worktree | `.claude/worktrees/wp-infra-01-neo4j` (создаёт `claude -w wp-infra-01-neo4j`) |
| Заголовок PR | `[PRODUCT] WP-INFRA-01: Neo4j памяти проекта: сервис, лимиты, бэкап, CI, шаг деплоя` |
| Сессия | `product-infra` |
| Модель | `sonnet` |
| Усилие | — |
| Почему такая модель | модель реализатора по умолчанию (orch.yaml models.implement) |
| Режим | nacl: `/nacl-tl-dev` (TECH), `/nacl-tl-review`; ADR-013 через `/nacl-sa-feature` под замком `graph` (граф спецификаций — другой экземпляр Neo4j) |
| Команды методологии: разрешены | nacl: `nacl-tl-dev-be`, `nacl-tl-dev`, `nacl-tl-fix`, `nacl-tl-review`, `nacl-tl-regression-test`, `nacl-tl-verify-code`, `nacl-tl-sync`, `nacl-tl-docs`, `nacl-tl-stubs`, `nacl-sa-uc`, `nacl-sa-domain`, `nacl-sa-feature`, `nacl-sa-validate`, `nacl-tl-plan`, `nacl-tl-status` |
| Команды методологии: запрещены | `nacl-tl-release`, `nacl-tl-deploy`, `nacl-tl-deliver`, `nacl-tl-hotfix`, `nacl-tl-ship`, `nacl-tl-conductor`, `nacl-tl-full`, `nacl-goal`, `nacl-publish` |
| Разрешённые пути | `docker-compose.yml`, `.github/**`, `scripts/**`, `.env.example` |
| Общие пути, которые трогает пакет | нет (ADR-013, external-contracts/neo4j.md и раздел deploy-plan пишет WP-BACKEND-06) |
| Миграции | нет |
| Ресурсы (замки) | `dev-stack` по запросу |
| Тестовая БД и порты | нет; нет |
| Слот слияния | <место в очереди слияний, задаётся при приёмке> |
| Контракт | env `MEMORY_NEO4J_URI`, `MEMORY_NEO4J_USER`, `MEMORY_NEO4J_PASSWORD`, `MEMORY_NEO4J_DATABASE`; команда `pnpm --filter @transcrib/worker run graph:migrate` (реализует WP-WORKER-MEMORY-01; деплой вызывает её с `--if-present`) |
| Зависит от | нет (R-1 закрыт 2026-10-07: лимиты памяти вписаны в раздел 2) |
| Размер | S |
| Спецификация | ADR-013 (новый) |
| Граф | ADR-013 |
| Решения | D-3, D-4, D-13, D-15 |

Общие пути этого репозитория (объяви те, что трогает пакет): `pnpm-lock.yaml`, `package.json`, `**/package.json`, `shared/**`, `api/prisma/**`, `.tl/**`, `graph-infra/**`, `config.yaml`, `CLAUDE.md`, `api/src/server.ts`, `worker/src/index.ts`, `worker/src/job-processor.ts`, `worker/src/queues.ts`, `web/src/App.tsx`, `web/src/i18n/**`.
Ресурсы этого репозитория, требующие замка: `migrations`, `graph` (по запросу: LOCK/UNLOCK, см. раздел 6), `dev-stack` (по запросу: LOCK/UNLOCK, см. раздел 6).

## 0. Подготовка worktree

1. Переключи worktree на ветку пакета: `git fetch origin && git switch -c feature/wp-infra-01-neo4j origin/main`.
2. Подготовь worktree (команды из `orch.yaml`, выполнять внутри worktree):

   ```bash
   pnpm install --frozen-lockfile
   pnpm --filter @transcrib/api run db:generate
   ```
3. Правь только разрешённые пути; общие пути — только объявленные в шапке и после получения замка.

## 1. Факты

- D-13: граф задач и решений — в Neo4j на проде, отдельный экземпляр от dev-контейнера `transcrib-neo4j` (порты 3614/3627, только для спецификаций, после OOM пересоздаётся вручную).
- Прод-деплой не управляет контейнерами: `.github/workflows/deploy-production.yml:38-71` — git reset, сборка, `db:migrate:deploy`, rsync фронта, рестарт pm2; Postgres/Redis/MinIO подняты на VM отдельно. Запуск Neo4j на VM — действие владельца (R-n), пакет готовит определение и скрипты.
- `docker-compose.yml:1-74` — postgres, redis, minio, minio-init; CI поднимает только postgres (`.github/workflows/ci.yml:24-36`).
- Прод-VM (R-1, 2026-10-07): 7.8 GiB RAM (used 3.2 GiB, swap 2 GiB, из него занято 715 MiB), 4 vCPU, диск `/` 30 GB, свободно 4.6 GB (84 %). На том же docker-демоне уже живут чужие контейнеры: `fc-neo4j` (1.28 GiB из лимита 2 GiB), `learn-mattermost`, `learn-postgres`, `learn-redis`. Transcrib (api/worker под pm2 в `/opt/transcrib`, Postgres/Redis/MinIO) в `docker stats` не виден — работает вне этого демона. Вывод: второй Neo4j получает жёсткий потолок памяти и обязан падать с выходом, а не зависать, при OOM; диск тесный — бэкапы сжатые и короткая ротация (D-16).

## 2. Объём

1. Сервис `memory-neo4j` в `docker-compose.yml`: Neo4j 5 Community LTS, порты только на 127.0.0.1 и не пересекаются с dev 3614/3627, auth включена (пароль из env), отдельный volume, явные лимиты по D-16: `NEO4J_server_memory_heap_initial__size=512m`, `NEO4J_server_memory_heap_max__size=512m`, `NEO4J_server_memory_pagecache_size=256m`, `NEO4J_db_memory_transaction_total_max=256m`, `NEO4J_server_jvm_additional=-XX:+ExitOnOutOfMemoryError` (при OOM процесс выходит, контейнер перезапускается, а не висит, как dev-контейнер), потолок контейнера `mem_limit: 1536m` (`deploy.resources.limits.memory` для compose v2), `restart: unless-stopped`, healthcheck.
2. `deploy-production.yml`: после `db:migrate:deploy` — `pnpm --filter @transcrib/worker run --if-present graph:migrate`; если `MEMORY_NEO4J_URI` не задан — шаг пропускается с предупреждением (деплой не ломается до запуска Neo4j владельцем).
3. CI: service Neo4j 5 в `ci.yml` с env для интеграционных тестов графа.
4. `scripts/neo4j-backup.sh`: дамп (`neo4j-admin database dump` с кратким стопом контейнера — Community не умеет online), сжатый (gzip), ротация 3 копий (диск прода: 4.6 GB свободно, D-16), перед дампом проверка свободного места (минимум 2× размер каталога данных, иначе выход с ошибкой) + `scripts/neo4j-restore.sh`; инструкция по cron и восстановлению — в `scripts/README-neo4j.md` (раздел в `.tl/deploy-plan.md` пишет WP-BACKEND-06 со ссылкой на этот файл).
5. `.env.example` — переменные `MEMORY_NEO4J_*`.
6. Не делать: код драйвера и миграций графа (WP-WORKER-MEMORY-01), запуск на проде.

### Не входит

- merge, деплой, PROD, запись в БД
- другие модули и рабочее пространство оркестратора
- файлы вне разрешённых путей; общие пути, не объявленные выше
- подъём версий и release notes, если не перечислены выше

## 3. Критерии приёмки

1. `docker compose up memory-neo4j` поднимает здоровый сервис с заданными лимитами (вывод `docker inspect`/`SHOW SETTINGS` в PR).
2. Деплой-скрипт без `MEMORY_NEO4J_URI` и без скрипта `graph:migrate` проходит (dry-run шага в PR).
3. CI с сервисом Neo4j зелёный.
4. Бэкап и восстановление проверены локально, шаги в PR.

## 4. Порядок сдачи

- PR из `feature/wp-infra-01-neo4j` в `main`; не мержить.
- Тело PR = отчёт разработки + `Deviations` (чем результат отличается от пакета и почему).
- Затем сообщение `product-coord`: `[PRODUCT] READY WP-INFRA-01 :: <sha> :: ref=<PR URL>`.

## 5. Start prompt

```text
Прочитай /home/cloudpc/projects/transcriber-orch/docs/orchestration/product/work-packages/WP-INFRA-01-neo4j.md и выполни. Сначала раздел 0 (подготовка worktree). Ветка feature/wp-infra-01-neo4j от origin/main, PR в main, не мержить. По готовности — сообщение product-coord: [PRODUCT] READY WP-INFRA-01 :: <sha> :: ref=<PR URL>

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
cd /home/cloudpc/projects/transcriber && claude -w wp-infra-01-neo4j --model sonnet --name product-infra "Прочитай /home/cloudpc/projects/transcriber-orch/docs/orchestration/product/work-packages/WP-INFRA-01-neo4j.md и выполни. Сначала раздел 0 (подготовка worktree). Ветка feature/wp-infra-01-neo4j от origin/main, PR в main, не мержить. По готовности — сообщение product-coord: [PRODUCT] READY WP-INFRA-01 :: <sha> :: ref=<PR URL>

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
- Пришли `product-coord`: `[PRODUCT] QUESTION WP-INFRA-01 :: отказ: <точный текст отказа> :: ref=<команда>`; продолжай работу, которой это не нужно, или жди `ANSWER`.
- Ресурсы по запросу (`graph`, `dev-stack`): перед использованием пришли `product-coord`: `[PRODUCT] LOCK WP-INFRA-01 :: <ресурс> :: ref=<зачем>` и жди `ACK`; как только закончишь — `[PRODUCT] UNLOCK WP-INFRA-01 :: <ресурс> :: ref=<результат>`. READY возвращает все замки по запросу.

## Пересдачи

<Циклы REVISE: дата, пункты, коммит.>
