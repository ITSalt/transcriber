# WP-FRONTEND-02 — Экран входа, переключатель пространств, список задач

| Поле | Значение |
|------|----------|
| Поток | frontend (area) |
| Репозиторий | . |
| Базовая ветка | main |
| Линия | main |
| Рабочая ветка | `feature/wp-frontend-02-login-tasks` |
| Worktree | `.claude/worktrees/wp-frontend-02-login-tasks` (создаёт `claude -w wp-frontend-02-login-tasks`) |
| Заголовок PR | `[PRODUCT] WP-FRONTEND-02: Экран входа, переключатель пространств, список задач` |
| Сессия | `product-frontend` |
| Модель | `sonnet` |
| Усилие | — |
| Почему такая модель | модель реализатора по умолчанию (orch.yaml models.implement) |
| Режим | nacl: `/nacl-tl-dev-fe` по TDD, `/nacl-tl-sync` (контракт BACKEND-01), `/nacl-tl-review --fe`, `/nacl-tl-qa` локально |
| Команды методологии: разрешены | nacl: `nacl-tl-dev-fe`, `nacl-tl-fix`, `nacl-tl-review`, `nacl-tl-regression-test`, `nacl-tl-verify-code`, `nacl-tl-sync`, `nacl-tl-docs`, `nacl-tl-stubs`, `nacl-tl-qa`, `nacl-sa-ui`, `nacl-tl-status` |
| Команды методологии: запрещены | `nacl-tl-release`, `nacl-tl-deploy`, `nacl-tl-deliver`, `nacl-tl-hotfix`, `nacl-tl-ship`, `nacl-tl-conductor`, `nacl-tl-full`, `nacl-goal`, `nacl-publish` |
| Разрешённые пути | `web/**` |
| Общие пути, которые трогает пакет | нет (контракт из `shared/` только читается) |
| Миграции | нет |
| Ресурсы (замки) | `dev-stack` по запросу (для локального E2E) |
| Тестовая БД и порты | нет; нет |
| Слот слияния | <место в очереди слияний, задаётся при приёмке> |
| Контракт | shared auth/workspace v1 из WP-BACKEND-01 |
| Зависит от | WP-BACKEND-01 (ветка с контрактом; ветвиться от неё, если ещё не в main — по указанию оркестратора), WP-FRONTEND-01 |
| Размер | M |
| Спецификация | UC-001 (каталог → список задач), новые UC входа/выбора пространства из FR-003 |
| Граф | нет (граф обновляет BACKEND-01); при необходимости — `/nacl-sa-ui` под замком `graph` |
| Решения | D-3, D-5, A-2; P-4, P-6 |

Общие пути этого репозитория (объяви те, что трогает пакет): `pnpm-lock.yaml`, `package.json`, `**/package.json`, `shared/**`, `api/prisma/**`, `.tl/**`, `graph-infra/**`, `config.yaml`, `CLAUDE.md`.
Ресурсы этого репозитория, требующие замка: `migrations`, `graph` (по запросу: LOCK/UNLOCK, см. раздел 6), `dev-stack` (по запросу: LOCK/UNLOCK, см. раздел 6).

## 0. Подготовка worktree

1. Переключи worktree на ветку пакета: `git fetch origin && git switch -c feature/wp-frontend-02-login-tasks origin/main`.
2. Подготовь worktree (команды из `orch.yaml`, выполнять внутри worktree):

   ```bash
   pnpm install --frozen-lockfile
   pnpm --filter @transcrib/api run db:generate
   ```
3. Правь только разрешённые пути; общие пути — только объявленные в шапке и после получения замка.

## 1. Факты

- Маршруты `/`, `/catalog`, `/upload`, `/meetings/:id[/transcript|/protocol]`, логина нет (`web/src/App.tsx:12-37`).
- Клиент API — `fetch(path)` на тот же origin без credentials (`web/src/lib/api.ts:22`); в dev Vite проксирует на :3000 (`web/vite.config.ts:18-20`).
- Каталог без фильтров и пагинации (`web/src/routes/catalog/index.tsx`, `shared/src/api/uc001.ts:6-18`).
- По D-3 merge в main = прод: этот пакет доставляется сразу после BACKEND-01, иначе прод останется без экрана входа.

## 2. Объём

1. Экран входа (форма по P-6: логин + 6-значный PIN, поле PIN — `inputmode=numeric`, 6 ячеек или одно поле с маской), ошибки без раскрытия причины, сообщение о блокировке.
2. Охрана маршрутов: без сессии (401 от API) → редирект на вход с возвратом на исходный URL; глобальная обработка 401 в `web/src/lib/api.ts`.
3. Переключатель пространства в шапке AppShell (из `/api/auth/me`); выбранное пространство хранится в URL (`/w/:workspaceId/...`) или в localStorage с фолбэком на первое; смена пространства сбрасывает кэш TanStack Query.
4. Каталог переименовать в «Задачи» (A-2): строки — файл, дата, статус, ссылка на протокол; только текущее пространство. Загрузка — в текущее пространство.
5. Меню пользователя: имя, «Выйти».
6. Чужая/несуществующая встреча → страница «Не найдено» (без различия).
7. Не делать: проекты и контекст (WP-FRONTEND-03).

### Не входит

- merge, деплой, PROD, запись в БД
- другие модули и рабочее пространство оркестратора
- файлы вне разрешённых путей; общие пути, не объявленные выше
- подъём версий и release notes, если не перечислены выше

## 3. Критерии приёмки

1. Тесты web: редирект без сессии, вход, ошибка PIN, блокировка, смена пространства обновляет список, 404-страница.
2. `pnpm -r typecheck`, `pnpm test` зелёные; `/nacl-tl-sync` без расхождений с контрактом.
3. Локальный E2E (dev-stack под замком): два пользователя, разные пространства; скриншоты входа и списка задач в PR.

## 4. Порядок сдачи

- PR из `feature/wp-frontend-02-login-tasks` в `main`; не мержить.
- Тело PR = отчёт разработки + `Deviations` (чем результат отличается от пакета и почему).
- Затем сообщение `product-coord`: `[PRODUCT] READY WP-FRONTEND-02 :: <sha> :: ref=<PR URL>`.

## 5. Start prompt

```text
Прочитай /home/cloudpc/projects/transcriber-orch/docs/orchestration/product/work-packages/WP-FRONTEND-02-login-tasks.md и выполни. Сначала раздел 0 (подготовка worktree). Ветка feature/wp-frontend-02-login-tasks от origin/main, PR в main, не мержить. По готовности — сообщение product-coord: [PRODUCT] READY WP-FRONTEND-02 :: <sha> :: ref=<PR URL>

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
cd /home/cloudpc/projects/transcriber-orch && claude -w wp-frontend-02-login-tasks --model sonnet --name product-frontend "Прочитай /home/cloudpc/projects/transcriber-orch/docs/orchestration/product/work-packages/WP-FRONTEND-02-login-tasks.md и выполни. Сначала раздел 0 (подготовка worktree). Ветка feature/wp-frontend-02-login-tasks от origin/main, PR в main, не мержить. По готовности — сообщение product-coord: [PRODUCT] READY WP-FRONTEND-02 :: <sha> :: ref=<PR URL>

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
- Пришли `product-coord`: `[PRODUCT] QUESTION WP-FRONTEND-02 :: отказ: <точный текст отказа> :: ref=<команда>`; продолжай работу, которой это не нужно, или жди `ANSWER`.
- Ресурсы по запросу (`graph`, `dev-stack`): перед использованием пришли `product-coord`: `[PRODUCT] LOCK WP-FRONTEND-02 :: <ресурс> :: ref=<зачем>` и жди `ACK`; как только закончишь — `[PRODUCT] UNLOCK WP-FRONTEND-02 :: <ресурс> :: ref=<результат>`. READY возвращает все замки по запросу.

## Пересдачи

<Циклы REVISE: дата, пункты, коммит.>
