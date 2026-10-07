# WP-BACKEND-05 — Neo4j для памяти проекта: сервис, лимиты памяти, бэкап, CI

| Поле | Значение |
|------|----------|
| Поток | backend (area) |
| Репозиторий | . |
| Базовая ветка | main |
| Линия | main |
| Рабочая ветка | `feature/wp-backend-05-neo4j-prod` |
| Worktree | `.claude/worktrees/wp-backend-05-neo4j-prod` (создаёт `claude -w wp-backend-05-neo4j-prod`) |
| Заголовок PR | `[PRODUCT] WP-BACKEND-05: Neo4j для памяти проекта: сервис, лимиты памяти, бэкап, CI` |
| Сессия | `product-backend` |
| Модель | `sonnet` |
| Усилие | — |
| Почему такая модель | модель реализатора по умолчанию (orch.yaml models.implement) |
| Режим | nacl: `/nacl-tl-dev` (TECH-задача инфраструктуры), `/nacl-tl-review`; спецификация — ADR о втором хранилище через `/nacl-sa-feature` (граф спецификаций — под замком `graph`, это другой экземпляр Neo4j) |
| Команды методологии: разрешены | nacl: `nacl-tl-dev-be`, `nacl-tl-dev`, `nacl-tl-fix`, `nacl-tl-review`, `nacl-tl-regression-test`, `nacl-tl-verify-code`, `nacl-tl-sync`, `nacl-tl-docs`, `nacl-tl-stubs`, `nacl-sa-uc`, `nacl-sa-domain`, `nacl-sa-feature`, `nacl-sa-validate`, `nacl-tl-plan`, `nacl-tl-status` |
| Команды методологии: запрещены | `nacl-tl-release`, `nacl-tl-deploy`, `nacl-tl-deliver`, `nacl-tl-hotfix`, `nacl-tl-ship`, `nacl-tl-conductor`, `nacl-tl-full`, `nacl-goal`, `nacl-publish` |
| Разрешённые пути | `api/**`, `worker/**` |
| Общие пути, которые трогает пакет | `package.json`, `**/package.json`, `pnpm-lock.yaml` (neo4j-driver), `.tl/**` (ADR, external-contracts/neo4j.md, deploy-plan); вне путей модуля, разрешено этим пакетом: `docker-compose.yml`, `.env.example`, `.github/workflows/ci.yml`, `.github/workflows/deploy-production.yml`, `scripts/neo4j-backup.sh` |
| Миграции | нет миграций Postgres; миграции графа — идемпотентные Cypher-скрипты (constraints/indexes) с версией в узле `:SchemaVersion` |
| Ресурсы (замки) | `graph` по запросу (только для ADR в графе спецификаций); `dev-stack` по запросу |
| Тестовая БД и порты | нет; нет |
| Слот слияния | <место в очереди слияний, задаётся при приёмке> |
| Контракт | env `MEMORY_NEO4J_URI`, `MEMORY_NEO4J_USER`, `MEMORY_NEO4J_PASSWORD`, `MEMORY_NEO4J_DATABASE`; модуль `worker/src/graph/` (драйвер, сессии, миграции) — для WP-BACKEND-04 |
| Зависит от | нет (лимиты памяти — после закрытия R-1) |
| Размер | M |
| Спецификация | ADR-013 (новый): Neo4j как хранилище памяти проекта |
| Граф | ADR-013 через `/nacl-sa-feature` |
| Решения | D-3, D-4, D-13 |

Общие пути этого репозитория (объяви те, что трогает пакет): `pnpm-lock.yaml`, `package.json`, `**/package.json`, `shared/**`, `api/prisma/**`, `.tl/**`, `graph-infra/**`, `config.yaml`, `CLAUDE.md`.
Ресурсы этого репозитория, требующие замка: `migrations`, `graph` (по запросу: LOCK/UNLOCK, см. раздел 6), `dev-stack` (по запросу: LOCK/UNLOCK, см. раздел 6).

## 0. Подготовка worktree

1. Переключи worktree на ветку пакета: `git fetch origin && git switch -c feature/wp-backend-05-neo4j-prod origin/main`.
2. Подготовь worktree (команды из `orch.yaml`, выполнять внутри worktree):

   ```bash
   pnpm install --frozen-lockfile
   pnpm --filter @transcrib/api run db:generate
   ```
3. Правь только разрешённые пути; общие пути — только объявленные в шапке и после получения замка.

## 1. Факты

- D-13: граф задач и решений — в Neo4j на проде, отдельный экземпляр от dev-контейнера `transcrib-neo4j` (порты 3614/3627, только для спецификаций; после OOM его пересоздают вручную — см. память проекта).
- Прод-деплой не управляет контейнерами: `deploy-production.yml:38-71` делает git reset, pnpm build, `db:migrate:deploy`, rsync фронта и рестарт pm2; инфраструктура (Postgres/Redis/MinIO) поднята на VM отдельно. Значит запуск Neo4j на VM — действие владельца (R), пакет готовит определение и скрипты.
- `docker-compose.yml` содержит postgres, redis, minio, minio-init (`:1-74`); CI поднимает только postgres как service (`.github/workflows/ci.yml:24-36`).
- Объём памяти прод-VM неизвестен — R-1.

## 2. Объём

1. Сервис `memory-neo4j` в `docker-compose.yml`: Neo4j 5 Community LTS, привязка портов только к 127.0.0.1 (порты не пересекаются с dev 3614/3627), auth включена, пароль из env, отдельный volume, явные `NEO4J_server_memory_heap_max__size` и `pagecache_size` (значения по итогам R-1, по умолчанию heap 512m + pagecache 256m), `restart: unless-stopped`, healthcheck.
2. `worker/src/graph/`: драйвер `neo4j-driver`, фабрика сессий, закрытие при остановке, health-проба; раннер миграций графа (constraints уникальности по id, индексы по workspaceId/projectId) — идемпотентный, версия в `:SchemaVersion`.
3. Скрипт `pnpm --filter @transcrib/worker run graph:migrate` и его вызов в `deploy-production.yml` после `db:migrate:deploy`; если `MEMORY_NEO4J_URI` не задан — шаг пропускается с предупреждением (деплой не ломается до запуска Neo4j владельцем).
4. `/api/health` (или отдельный `/api/health/deps`) показывает состояние Neo4j, не роняя основной health при его недоступности.
5. Бэкап: `scripts/neo4j-backup.sh` (online dump недоступен в Community → `neo4j-admin database dump` с кратким стопом или копия volume; выбрать и обосновать) с ротацией 7 копий; инструкция по cron и восстановлению в `.tl/deploy-plan.md`.
6. CI: service Neo4j в `ci.yml` для интеграционных тестов графа.
7. `.env.example` и документация переменных; ADR-013.
8. Не делать: логику памяти проекта (WP-BACKEND-04); запуск на проде (владелец по R).

### Не входит

- merge, деплой, PROD, запись в БД
- другие модули и рабочее пространство оркестратора
- файлы вне разрешённых путей; общие пути, не объявленные выше
- подъём версий и release notes, если не перечислены выше

## 3. Критерии приёмки

1. `docker compose up memory-neo4j` локально поднимает здоровый сервис с заданными лимитами (`docker inspect`/`SHOW SETTINGS` в PR).
2. `graph:migrate` дважды подряд — второй запуск без изменений (тест).
3. Деплой без `MEMORY_NEO4J_URI` проходит (шаг пропущен) — проверка скрипта в тесте или dry-run.
4. CI с сервисом Neo4j зелёный; typecheck и тесты зелёные.
5. Бэкап и восстановление проверены локально, шаги в PR.

## 4. Порядок сдачи

- PR из `feature/wp-backend-05-neo4j-prod` в `main`; не мержить.
- Тело PR = отчёт разработки + `Deviations` (чем результат отличается от пакета и почему).
- Затем сообщение `product-coord`: `[PRODUCT] READY WP-BACKEND-05 :: <sha> :: ref=<PR URL>`.

## 5. Start prompt

```text
Прочитай /home/cloudpc/projects/transcriber-orch/docs/orchestration/product/work-packages/WP-BACKEND-05-neo4j-prod.md и выполни. Сначала раздел 0 (подготовка worktree). Ветка feature/wp-backend-05-neo4j-prod от origin/main, PR в main, не мержить. По готовности — сообщение product-coord: [PRODUCT] READY WP-BACKEND-05 :: <sha> :: ref=<PR URL>

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
cd /home/cloudpc/projects/transcriber-orch && claude -w wp-backend-05-neo4j-prod --model sonnet --name product-backend "Прочитай /home/cloudpc/projects/transcriber-orch/docs/orchestration/product/work-packages/WP-BACKEND-05-neo4j-prod.md и выполни. Сначала раздел 0 (подготовка worktree). Ветка feature/wp-backend-05-neo4j-prod от origin/main, PR в main, не мержить. По готовности — сообщение product-coord: [PRODUCT] READY WP-BACKEND-05 :: <sha> :: ref=<PR URL>

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
- Пришли `product-coord`: `[PRODUCT] QUESTION WP-BACKEND-05 :: отказ: <точный текст отказа> :: ref=<команда>`; продолжай работу, которой это не нужно, или жди `ANSWER`.
- Ресурсы по запросу (`graph`, `dev-stack`): перед использованием пришли `product-coord`: `[PRODUCT] LOCK WP-BACKEND-05 :: <ресурс> :: ref=<зачем>` и жди `ACK`; как только закончишь — `[PRODUCT] UNLOCK WP-BACKEND-05 :: <ресурс> :: ref=<результат>`. READY возвращает все замки по запросу.

## Пересдачи

<Циклы REVISE: дата, пункты, коммит.>
