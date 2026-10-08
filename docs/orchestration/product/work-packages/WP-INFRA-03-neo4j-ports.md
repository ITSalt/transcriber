# WP-INFRA-03 — Порты Neo4j памяти проекта 7476/7689 (D-26)

| Поле | Значение |
|------|----------|
| Поток | infra (area) |
| Репозиторий | /home/cloudpc/projects/transcriber |
| Базовая ветка | main |
| Линия | main |
| Рабочая ветка | `feature/wp-infra-03-neo4j-ports` |
| Worktree | `.claude/worktrees/wp-infra-03-neo4j-ports` (создаёт `claude -w wp-infra-03-neo4j-ports`) |
| Заголовок PR | `[PRODUCT] WP-INFRA-03: Порты Neo4j памяти проекта 7476/7689 (D-26)` |
| Сессия | `product-infra` |
| Модель | `sonnet` |
| Усилие | — |
| Почему такая модель | модель реализатора по умолчанию (orch.yaml models.implement) |
| Режим | nacl: `/nacl-tl-dev` (TECH), `/nacl-tl-review`; граф не трогает |
| Команды методологии: разрешены | nacl: `nacl-tl-dev-be`, `nacl-tl-dev`, `nacl-tl-fix`, `nacl-tl-review`, `nacl-tl-regression-test`, `nacl-tl-verify-code`, `nacl-tl-sync`, `nacl-tl-docs`, `nacl-tl-stubs`, `nacl-sa-uc`, `nacl-sa-domain`, `nacl-sa-feature`, `nacl-sa-validate`, `nacl-tl-plan`, `nacl-tl-status` |
| Команды методологии: запрещены | `nacl-tl-release`, `nacl-tl-deploy`, `nacl-tl-deliver`, `nacl-tl-hotfix`, `nacl-tl-ship`, `nacl-tl-conductor`, `nacl-tl-full`, `nacl-goal`, `nacl-publish` |
| Разрешённые пути | `docker-compose.yml`, `scripts/README-neo4j.md`, `.env.example`, `.tl/deploy-plan.md` (только §9) |
| Общие пути, которые трогает пакет | `.tl/deploy-plan.md` |
| Миграции | нет |
| Ресурсы (замки) | нет |
| Тестовая БД и порты | нет; нет |
| Слот слияния | <место в очереди слияний, задаётся при приёмке> |
| Контракт | нет (`.tl/external-contracts/neo4j.md` портов не фиксирует — проверить и не править) |
| Зависит от | нет (WP-INFRA-01 в проде) |
| Размер | XS |
| Спецификация | нет |
| Граф | нет |
| Решения | D-26 (порты 7476/7689), D-16 (лимиты не менять), D-19 |

Общие пути этого репозитория (объяви те, что трогает пакет): `pnpm-lock.yaml`, `package.json`, `**/package.json`, `shared/**`, `api/prisma/**`, `.tl/{status.json,master-plan.md,changelog.md,release-status.json,deploy-plan.md}`, `.tl/external-contracts/**`, `graph-infra/**`, `config.yaml`, `CLAUDE.md`, `api/src/server.ts`, `worker/src/index.ts`, `worker/src/job-processor.ts`, `worker/src/queues.ts`, `web/src/App.tsx`, `web/src/i18n/**`.
Ресурсы этого репозитория, требующие замка: `migrations`, `graph` (по запросу: LOCK/UNLOCK, см. раздел 6), `dev-stack` (по запросу: LOCK/UNLOCK, см. раздел 6).

## 0. Подготовка worktree

1. Переключи worktree на ветку пакета: `git fetch origin && git switch -c feature/wp-infra-03-neo4j-ports origin/main`.
2. Подготовь worktree (команды из `orch.yaml`, выполнять внутри worktree):

   ```bash
   pnpm install --frozen-lockfile
   pnpm --filter @transcrib/api run db:generate
   ```
3. Правь только разрешённые пути; общие пути — только объявленные в шапке и после получения замка.

## 1. Факты

- `docker-compose.yml:89-91` (main `7f3b99b`): `memory-neo4j` публикует `127.0.0.1:7475:7474` и `127.0.0.1:7688:7687`.
- На прод-VM (`ssh learn-prod`, 2026-10-08, R-15): оба порта слушает `docker-proxy` контейнера `fc-neo4j` другого проекта (`7475->7474`, `7688->7687`); `docker compose up -d memory-neo4j` упал: «Bind for 127.0.0.1:7475 failed: port is already allocated» (R-14). Контейнер `fc-neo4j` остаётся (D-26, вариант a).
- Порты 7476 и 7689 на VM свободны (`ss -ltn` 2026-10-08 показывает на 747x/768x только 7475/7688).
- Упоминания старых портов в репозитории: `scripts/README-neo4j.md:10,22`, `.env.example:42,49` (`MEMORY_NEO4J_URI=bolt://localhost:7688`), `.tl/deploy-plan.md` §9 (ссылается на README, портов не называет — проверить). Код (`worker/src`, `shared/src`, `api/src`) порты не хардкодит: URI берётся из `MEMORY_NEO4J_URI`; `ci.yml:66` использует сервисный Neo4j на 7687 — не трогать.
- В `/opt/transcrib/.env` уже дописаны `MEMORY_NEO4J_URI=bolt://127.0.0.1:7688`, `_USER`, `_PASSWORD`, `_DATABASE` (R-14); URI поправит владелец после доставки (R-17).

## 2. Объём

1. `docker-compose.yml`: `memory-neo4j.ports` → `"127.0.0.1:7476:7474"` и `"127.0.0.1:7689:7687"`; комментарий рядом: «7475/7688 заняты другим контейнером на prod-VM (D-26)». Лимиты памяти (D-16), healthcheck, volume — без изменений.
2. `scripts/README-neo4j.md`: порты 7476 (browser) / 7689 (bolt), пример `MEMORY_NEO4J_URI=bolt://localhost:7689`; абзац «порты заняты» с командой диагностики `ss -ltnp | grep -E ":7476|:7689"`.
3. `.env.example`: комментарий и `MEMORY_NEO4J_URI=bolt://localhost:7689`.
4. `.tl/deploy-plan.md` §9: если порты упоминаются — обновить; если нет — одна строка «порты 7476/7689 (D-26, прежние 7475/7688 заняты fc-neo4j)». Другие разделы не трогать.
5. Проверка: `docker compose config` показывает новые порты; `grep -rn "7475\|7688" --include="*.md" --include="*.yml" --include=".env.example" .` пуст (кроме `.tl/changelog.md`/истории, если есть). Если есть локальный docker — `docker compose up -d memory-neo4j` на 7476/7689 и `cypher-shell` через 7689; иначе написать «не проверено локально».
6. Не делать: менять `ci.yml`, workflow деплоя, код worker/api/shared, лимиты памяти, имя volume (данные контейнера на VM ещё не создавались, но имя оставить).

### Не входит

- merge, деплой, PROD, запись в БД
- другие модули и рабочее пространство оркестратора
- файлы вне разрешённых путей; общие пути, не объявленные выше
- подъём версий и release notes, если не перечислены выше

## 3. Критерии приёмки

1. `docker compose config | grep -A3 ports` для `memory-neo4j` показывает `127.0.0.1:7476->7474` и `127.0.0.1:7689->7687`.
2. В репозитории нет упоминаний `7475`/`7688` вне истории (`.tl/changelog.md`).
3. Живой сценарий при доставке (оркестратор): после merge владелец правит `MEMORY_NEO4J_URI` на 7689 и поднимает контейнер (R-17); `docker compose ps memory-neo4j` healthy, следующий деплой выполняет `graph:migrate` без ошибки.

## 4. Порядок сдачи

- PR из `feature/wp-infra-03-neo4j-ports` в `main`; не мержить.
- Тело PR = отчёт разработки + `Deviations` (чем результат отличается от пакета и почему).
- Затем сообщение `product-coord`: `[PRODUCT] READY WP-INFRA-03 :: <sha> :: ref=<PR URL>`.

## 5. Start prompt

```text
Прочитай /home/cloudpc/projects/transcriber-orch/docs/orchestration/product/work-packages/WP-INFRA-03-neo4j-ports.md и выполни. Сначала раздел 0 (подготовка worktree). Ветка feature/wp-infra-03-neo4j-ports от origin/main, PR в main, не мержить. По готовности — сообщение product-coord: [PRODUCT] READY WP-INFRA-03 :: <sha> :: ref=<PR URL>

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
cd /home/cloudpc/projects/transcriber && claude -w wp-infra-03-neo4j-ports --model sonnet --name product-infra "Прочитай /home/cloudpc/projects/transcriber-orch/docs/orchestration/product/work-packages/WP-INFRA-03-neo4j-ports.md и выполни. Сначала раздел 0 (подготовка worktree). Ветка feature/wp-infra-03-neo4j-ports от origin/main, PR в main, не мержить. По готовности — сообщение product-coord: [PRODUCT] READY WP-INFRA-03 :: <sha> :: ref=<PR URL>

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
- Пришли `product-coord`: `[PRODUCT] QUESTION WP-INFRA-03 :: отказ: <точный текст отказа> :: ref=<команда>`; продолжай работу, которой это не нужно, или жди `ANSWER`.
- Ресурсы по запросу (`graph`, `dev-stack`): перед использованием пришли `product-coord`: `[PRODUCT] LOCK WP-INFRA-03 :: <ресурс> :: ref=<зачем>` и жди `ACK`; как только закончишь — `[PRODUCT] UNLOCK WP-INFRA-03 :: <ресурс> :: ref=<результат>`. READY возвращает все замки по запросу.

## Пересдачи

<Циклы REVISE: дата, пункты, коммит.>
