# WP-BACKEND-01 — Вход по PIN, рабочие пространства и изоляция данных (API+worker)

| Поле | Значение |
|------|----------|
| Поток | backend (area) |
| Репозиторий | . |
| Базовая ветка | main |
| Линия | main |
| Рабочая ветка | `feature/wp-backend-01-auth-workspaces` |
| Worktree | `.claude/worktrees/wp-backend-01-auth-workspaces` (создаёт `claude -w wp-backend-01-auth-workspaces`) |
| Заголовок PR | `[PRODUCT] WP-BACKEND-01: Вход по PIN, рабочие пространства и изоляция данных (API+worker)` |
| Сессия | `product-backend` |
| Модель | `opus` |
| Усилие | `high` |
| Почему такая модель | права доступа, изоляция данных, миграция с бэкфиллом на проде |
| Режим | nacl, spec-first: `/nacl-sa-feature` (FeatureRequest: роли, сущности User/Workspace/Membership/Session, правила изоляции; граф — под замком `graph`), затем `/nacl-tl-dev-be` по TDD, `/nacl-tl-review --be` |
| Команды методологии: разрешены | nacl: `nacl-tl-dev-be`, `nacl-tl-dev`, `nacl-tl-fix`, `nacl-tl-review`, `nacl-tl-regression-test`, `nacl-tl-verify-code`, `nacl-tl-sync`, `nacl-tl-docs`, `nacl-tl-stubs`, `nacl-sa-uc`, `nacl-sa-domain`, `nacl-sa-feature`, `nacl-sa-validate`, `nacl-tl-plan`, `nacl-tl-status` |
| Команды методологии: запрещены | `nacl-tl-release`, `nacl-tl-deploy`, `nacl-tl-deliver`, `nacl-tl-hotfix`, `nacl-tl-ship`, `nacl-tl-conductor`, `nacl-tl-full`, `nacl-goal`, `nacl-publish` |
| Разрешённые пути | пути потока backend (orch.yaml): ядро api, api/src/features/auth/**, api/scripts/**, api/test/**; api/prisma/** — под замком |
| Общие пути, которые трогает пакет | `api/prisma/**` (одна миграция NOT NULL), `.tl/**`; вне путей модуля, разрешено этим пакетом: `.worktreeinclude` (D-1), `.env.example` (только строка `PIN_PEPPER`) |
| Миграции | да, маленькая: `*_meeting_workspace_not_null` — дозаполнить пустые `workspaceId` (встречи, созданные старым кодом между релизами) пространством «Роман» и поставить NOT NULL |
| Ресурсы (замки) | `migrations` (с dispatch до merge), `graph` по запросу |
| Тестовая БД и порты | нет; нет |
| Слот слияния | <место в очереди слияний, задаётся при приёмке> |
| Контракт | реализует контракт auth/workspace v1 из WP-BACKEND-06; ничего в `shared/` не меняет |
| Зависит от | WP-BACKEND-06 (в main) |
| Размер | L |
| Спецификация | NFR-007 (снять), RQ-003, SR-01 AUTHOR; UC-001..004, UC-100, UC-201, UC-301, UC-302 (проверка доступа) |
| Граф | новые DomainEntity User/Workspace/Membership/AuthSession, правило изоляции, FeatureRequest FR-003 — через `/nacl-sa-feature` |
| Решения | D-1, D-3, D-4, D-6, D-7, D-8, D-15; A-1, A-3 |

Общие пути этого репозитория (объяви те, что трогает пакет): `pnpm-lock.yaml`, `package.json`, `**/package.json`, `shared/**`, `api/prisma/**`, `.tl/**`, `graph-infra/**`, `config.yaml`, `CLAUDE.md`.
Ресурсы этого репозитория, требующие замка: `migrations`, `graph` (по запросу: LOCK/UNLOCK, см. раздел 6), `dev-stack` (по запросу: LOCK/UNLOCK, см. раздел 6).

## 0. Подготовка worktree

1. Переключи worktree на ветку пакета: `git fetch origin && git switch -c feature/wp-backend-01-auth-workspaces origin/main`.
2. Подготовь worktree (команды из `orch.yaml`, выполнять внутри worktree):

   ```bash
   pnpm install --frozen-lockfile
   pnpm --filter @transcrib/api run db:generate
   ```
3. Правь только разрешённые пути; общие пути — только объявленные в шапке и после получения замка.

## 1. Факты

- Авторизации нет: «NFR-007: No authentication at MVP» в `api/src/routes/uc-001.ts:6` и uc-002/003/004/201/301/302; «RQ-003 … deferred until auth» `api/src/services/uc-001.service.ts:8`; «ownership is unchecked» `api/src/services/uc-003.service.ts:17`.
- Нет User/сессий; плагины Fastify — только type-provider-zod (`api/package.json:25`); `buildApp` `api/src/server.ts:55-76`; логгер уже редактирует `authorization`/`cookie` (`api/src/plugins/logger.ts:14-15`).
- `Meeting` без владельца (`api/prisma/schema.prisma:50-65`); на проде есть реальные встречи (`.tl/release-status.json:80`). Миграции применяются до рестарта pm2 (`.github/workflows/deploy-production.yml:57-58`), прецедент бэкфилла — `api/prisma/migrations/20260814120000_uc200_transcript_detected_language/migration.sql`.
- Пути доступа к данным, которые надо закрыть: все маршруты `api/src/routes/*.ts`, SSE `api/src/routes/events.ts:33`, presigned-загрузка `upload-init.ts:17-72` (ключ `pending/<uuid>`), finalize `api/src/services/uc-100.service.ts:126-258`, PDF `api/src/lib/pdf.ts`, скачивание транскрипта.
- Прод за Caddy, `/api/*` → 127.0.0.1:3010 (`.tl/scripts/transcrib-caddyblock.conf:3-52`) — тот же origin, cookie `SameSite=Lax; Secure; HttpOnly` подходит.

## 2. Объём

1. Добавить `.worktreeinclude` в корень (`.env`, `.env.local`) — D-1.
2. Вход только по PIN (D-8) на таблицах из WP-BACKEND-06: поиск по `pinLookup` = HMAC-SHA256(PIN, env `PIN_PEPPER`), проверка scrypt-хеша `pinHash` (соль, сравнение за постоянное время); PIN нигде не хранится и не логируется. `POST /api/auth/login {pin}`, `POST /api/auth/logout`, `GET /api/auth/me` → `{user, workspaces}`. Сессия — случайный токен в httpOnly Secure SameSite=Lax cookie на 30 дней, в БД только хеш.
3. Блокировка (A-3): ключ клиента — IP из `X-Forwarded-For` только от прокси 127.0.0.1; 10 неудач → бессрочно 423 «Больше нельзя, пиши Максу для разблокировки», в том числе для верного PIN; снимается только CLI. Глобальный счётчик: > 100 неудач/час — предупреждение в лог.
4. Глобальный preHandler: всё под `/api/*` требует сессию, кроме `/api/health` и `/api/auth/login`; 401 без сессии. Декоратор запроса `request.auth {userId, workspaceIds}` и помощник `assertMeetingAccess(meetingId)` / `assertWorkspaceAccess(workspaceId)` в `api/src/features/auth/` — ими пользуются пакеты api-projects, api-feedback, api-memory.
5. Изоляция всех существующих маршрутов: каждая встреча проверяется на членство; чужая или несуществующая → одинаковый 404. Список встреч — по `workspaceId` (обязателен, с членством). Upload init/complete/abort — в выбранное пространство, S3-ключ новых загрузок `ws/<workspaceId>/...`, presign только после проверки. SSE, PDF, скачивание транскрипта — та же проверка.
6. «Крючки» ядра для параллельных потоков (чтобы они не правили ядро):
   - `complete` принимает `deferStart` из контракта: при `true` встреча остаётся `AWAITING_START`, очередь не ставится (запуск — `POST /start` из WP-API-PROJECTS-01); при `false`/отсутствии — как сейчас (D-9 обеспечивает UI, который всегда шлёт `true`).
   - `PUT /api/meetings/:id/protocol` дополнительно пишет неизменяемую `ProtocolVersion(kind USER_EDIT, authorUserId)` в той же транзакции.
   - Удаление встречи с `projectId` пишет операцию в `GraphOutbox` в той же транзакции.
7. CLI (A-1): `user:create -- --name "<имя>" --pin <6 цифр> [--workspace "<имя|id>"]` (без `--workspace` создаёт личное пространство, D-6; с ним — привязывает, например к «Роман»; отказ при занятом PIN), `user:grant`, `user:reset-pin`, `user:unblock -- --client <ip>|--all`, `user:blocks`. Описать в `api/README.md` и `.tl/`. Строка `PIN_PEPPER=` в `.env.example`.
8. Не делать: UI, проекты/контекст/отзывы/память (свои потоки), изменения `shared/`.

### Не входит

- merge, деплой, PROD, запись в БД
- другие модули и рабочее пространство оркестратора
- файлы вне разрешённых путей; общие пути, не объявленные выше
- подъём версий и release notes, если не перечислены выше

## 3. Критерии приёмки

1. Интеграционный тест изоляции перебирает **все** зарегистрированные маршруты `/api/*` (список из Fastify, не вручную; включая будущие из `api/src/features/*`): без cookie → 401 (кроме health/login); пользователь B к встрече A → 404 на каждом методе, SSE, PDF, download. Тест лежит в `api/test/` и автоматически охватывает маршруты параллельных потоков после их merge.
2. Тесты входа: верный PIN → cookie и `/api/auth/me`; неверный → 401; 10-я неудача с одного IP → 423 с точным текстом, затем и верный PIN → 423 до `user:unblock`; PIN не 6 цифр → 400; два пользователя с одним PIN создать нельзя; в БД нет PIN в открытом виде.
3. Тесты крючков: `deferStart=true` → `AWAITING_START` без задания в очереди; `PUT` протокола создаёт `ProtocolVersion`; удаление встречи проекта пишет `GraphOutbox`.
4. Миграция NOT NULL проходит на БД, где есть встреча без workspaceId; `user:create --name Роман --workspace Роман` даёт доступ ко всем старым встречам (тест).
5. `pnpm -r typecheck`, `pnpm test` зелёные; в PR — список закрытых маршрутов, команды CLI, SQL отката миграции.

## 4. Порядок сдачи

- PR из `feature/wp-backend-01-auth-workspaces` в `main`; не мержить.
- Тело PR = отчёт разработки + `Deviations` (чем результат отличается от пакета и почему).
- Затем сообщение `product-coord`: `[PRODUCT] READY WP-BACKEND-01 :: <sha> :: ref=<PR URL>`.

## 5. Start prompt

```text
Прочитай /home/cloudpc/projects/transcriber-orch/docs/orchestration/product/work-packages/WP-BACKEND-01-auth-workspaces.md и выполни. Сначала раздел 0 (подготовка worktree). Ветка feature/wp-backend-01-auth-workspaces от origin/main, PR в main, не мержить. По готовности — сообщение product-coord: [PRODUCT] READY WP-BACKEND-01 :: <sha> :: ref=<PR URL>

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
cd /home/cloudpc/projects/transcriber-orch && claude -w wp-backend-01-auth-workspaces --model opus --effort high --name product-backend "Прочитай /home/cloudpc/projects/transcriber-orch/docs/orchestration/product/work-packages/WP-BACKEND-01-auth-workspaces.md и выполни. Сначала раздел 0 (подготовка worktree). Ветка feature/wp-backend-01-auth-workspaces от origin/main, PR в main, не мержить. По готовности — сообщение product-coord: [PRODUCT] READY WP-BACKEND-01 :: <sha> :: ref=<PR URL>

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
- Пришли `product-coord`: `[PRODUCT] QUESTION WP-BACKEND-01 :: отказ: <точный текст отказа> :: ref=<команда>`; продолжай работу, которой это не нужно, или жди `ANSWER`.
- Ресурсы по запросу (`graph`, `dev-stack`): перед использованием пришли `product-coord`: `[PRODUCT] LOCK WP-BACKEND-01 :: <ресурс> :: ref=<зачем>` и жди `ACK`; как только закончишь — `[PRODUCT] UNLOCK WP-BACKEND-01 :: <ресурс> :: ref=<результат>`. READY возвращает все замки по запросу.

## Пересдачи

<Циклы REVISE: дата, пункты, коммит.>
