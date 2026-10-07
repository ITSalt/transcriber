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
| Разрешённые пути | `api/**`, `worker/**` |
| Общие пути, которые трогает пакет | `shared/**` (Zod-схемы auth/workspace, `IAsrProvider` не трогать), `api/prisma/**`, `api/package.json` (cookie/rate-limit/scrypt-зависимости), `pnpm-lock.yaml`, `.tl/**`, `.worktreeinclude` (D-1, вне путей модуля — разрешено этим пакетом) |
| Миграции | да: одна аддитивная миграция `2026MMDDhhmmss_auth_workspaces` (новее `20260814120000_*`); FK `workspaceId` сначала nullable → бэкфилл по P-5 → NOT NULL в той же миграции; совместима со старыми процессами, работающими во время `migrate deploy` |
| Ресурсы (замки) | `migrations` (с dispatch до merge), `graph` по запросу |
| Тестовая БД и порты | нет; нет |
| Слот слияния | <место в очереди слияний, задаётся при приёмке> |
| Контракт | shared/src/api/auth.ts + workspace.ts — контракт v1 для WP-FRONTEND-02: `POST /api/auth/login {login,pin}`, `POST /api/auth/logout`, `GET /api/auth/me` → `{user:{id,name}, workspaces:[{id,name}]}`; текущее пространство — заголовок `X-Workspace-Id` или параметр; `GET /api/meetings?workspaceId=` |
| Зависит от | нет (P-4, P-5, P-6 должны быть закрыты) |
| Размер | L |
| Спецификация | NFR-007 (снять), RQ-003, SR-01 AUTHOR; UC-001..004, UC-100, UC-201, UC-301, UC-302 (проверка доступа) |
| Граф | новые DomainEntity User/Workspace/Membership/AuthSession, правило изоляции, FeatureRequest FR-003 — через `/nacl-sa-feature` |
| Решения | D-1, D-2, D-3, D-4; P-4, P-5, P-6 (ждут ответа); A-1 |

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
2. Схема: `User(id, login уникальный, name, pinHash, failedAttempts, lockedUntil)`, `Workspace(id, name, personal bool)`, `Membership(userId, workspaceId)`, `AuthSession(id, userId, tokenHash, expiresAt, lastSeenAt)`; `Meeting.workspaceId` NOT NULL после бэкфилла (P-5).
3. Вход по форме из P-6: PIN — ровно 6 цифр; хеш scrypt (node:crypto) с солью; сравнение за постоянное время; лимит попыток и блокировка по P-6; одинаковый ответ на «нет логина» и «неверный PIN». Сессия — случайный токен в httpOnly Secure SameSite=Lax cookie, в БД только хеш; logout удаляет сессию.
4. Глобальный preHandler: всё под `/api/*` требует сессию, кроме `/api/health` и `/api/auth/login`; 401 без сессии.
5. Изоляция: каждый запрос к встрече проверяет членство пользователя в её пространстве; чужая или несуществующая → одинаковый 404. Список встреч — только по выбранному пространству, к которому есть членство. Upload init/complete/abort привязаны к пространству; S3-ключ `ws/<workspaceId>/...` для новых загрузок; presign только после проверки. SSE, PDF, скачивание транскрипта — та же проверка.
6. Worker не меняет поведение, но пробрасывает workspaceId где нужно для ключей (если требуется).
7. CLI `pnpm --filter @transcrib/api run user:create -- --login <l> --name "<имя>" --pin <6 цифр> [--workspace <имя|id>]` (создаёт пользователя и личное пространство по P-4), `user:grant -- --login <l> --workspace <id>`, `user:reset-pin`. Без вывода PIN в логи. Описать в `api/README` или `.tl/` (A-1).
8. Контракт в `shared/` (см. шапку) + обновить спецификацию в графе (`/nacl-sa-feature`).
9. Не делать: UI (WP-FRONTEND-02), проекты/контекст, правку протокола.

### Не входит

- merge, деплой, PROD, запись в БД
- другие модули и рабочее пространство оркестратора
- файлы вне разрешённых путей; общие пути, не объявленные выше
- подъём версий и release notes, если не перечислены выше

## 3. Критерии приёмки

1. Интеграционный тест изоляции перебирает **все** зарегистрированные маршруты `/api/*` (список берётся из Fastify, не вручную): без cookie → 401 (кроме health/login); пользователь B к встрече пользователя A → 404 на каждом GET/PUT/DELETE/POST, SSE, PDF, download; новый маршрут без проверки роняет тест.
2. Тесты входа: верный PIN → cookie и `/api/auth/me`; неверный → 401 без различия причины; блокировка после лимита; PIN не 6 цифр → 400; в БД нет PIN в открытом виде.
3. Миграция: `prisma migrate deploy` на копии схемы с существующими встречами проходит, все встречи получают workspaceId по P-5; повторный запуск идемпотентен (CI-джоба миграций зелёная).
4. `pnpm -r typecheck` и `pnpm test` зелёные; CLI создаёт пользователя, которым можно войти (тест).
5. PR-тело: схема, список закрытых маршрутов, команды CLI, план отката миграции (SQL).

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
