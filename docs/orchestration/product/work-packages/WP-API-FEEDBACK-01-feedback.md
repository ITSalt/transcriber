# WP-API-FEEDBACK-01 — API версий протокола и обратной связи, разбор docx

| Поле | Значение |
|------|----------|
| Поток | api-feedback (area) |
| Репозиторий | . |
| Базовая ветка | main |
| Линия | main |
| Рабочая ветка | `feature/wp-api-feedback-01-feedback` |
| Worktree | `.claude/worktrees/wp-api-feedback-01-feedback` (создаёт `claude -w wp-api-feedback-01-feedback`) |
| Заголовок PR | `[PRODUCT] WP-API-FEEDBACK-01: API версий протокола и обратной связи, разбор docx` |
| Сессия | `product-api-feedback` |
| Модель | `sonnet` |
| Усилие | — |
| Почему такая модель | модель реализатора по умолчанию (orch.yaml models.implement) |
| Режим | nacl, spec-first: `/nacl-sa-feature` (UC фичи) под замком `graph`, затем `/nacl-tl-dev-be` по TDD, `/nacl-tl-review --be` |
| Команды методологии: разрешены | nacl: `nacl-tl-dev-be`, `nacl-tl-dev`, `nacl-tl-fix`, `nacl-tl-review`, `nacl-tl-regression-test`, `nacl-tl-verify-code`, `nacl-tl-sync`, `nacl-tl-docs`, `nacl-tl-stubs`, `nacl-sa-uc`, `nacl-sa-domain`, `nacl-sa-feature`, `nacl-sa-validate`, `nacl-tl-plan`, `nacl-tl-status` |
| Команды методологии: запрещены | `nacl-tl-release`, `nacl-tl-deploy`, `nacl-tl-deliver`, `nacl-tl-hotfix`, `nacl-tl-ship`, `nacl-tl-conductor`, `nacl-tl-full`, `nacl-goal`, `nacl-publish` |
| Разрешённые пути | `api/src/features/feedback/**` |
| Общие пути, которые трогает пакет | нет (маршруты подключаются автоматически из api/src/features/<фича>/routes.ts через реестр WP-BACKEND-06) |
| Миграции | нет |
| Ресурсы (замки) | `graph` по запросу |
| Тестовая БД и порты | нет; нет |
| Слот слияния | <место в очереди слияний, задаётся при приёмке> |
| Контракт | реализует контракт feedback v1 из WP-BACKEND-06: `GET /api/meetings/:id/protocol/versions`, `GET .../versions/:n`, `POST /api/meetings/:id/feedback` (multipart: kind, category, text, файл), `GET /api/meetings/:id/feedback`, скачивание файла отзыва |
| Зависит от | WP-BACKEND-01 (в main) |
| Размер | M |
| Спецификация | UC-301 (изменённый), FR-005 |
| Граф | UC отзывов — через `/nacl-sa-feature` |
| Решения | D-12, D-15 |

Общие пути этого репозитория (объяви те, что трогает пакет): `pnpm-lock.yaml`, `package.json`, `**/package.json`, `shared/**`, `api/prisma/**`, `.tl/**`, `graph-infra/**`, `config.yaml`, `CLAUDE.md`, `api/src/server.ts`, `worker/src/index.ts`, `worker/src/job-processor.ts`, `worker/src/queues.ts`, `web/src/App.tsx`, `web/src/i18n/**`.
Ресурсы этого репозитория, требующие замка: `migrations`, `graph` (по запросу: LOCK/UNLOCK, см. раздел 6), `dev-stack` (по запросу: LOCK/UNLOCK, см. раздел 6).

## 0. Подготовка worktree

1. Переключи worktree на ветку пакета: `git fetch origin && git switch -c feature/wp-api-feedback-01-feedback origin/main`.
2. Подготовь worktree (команды из `orch.yaml`, выполнять внутри worktree):

   ```bash
   pnpm install --frozen-lockfile
   pnpm --filter @transcrib/api run db:generate
   ```
3. Правь только разрешённые пути; общие пути — только объявленные в шапке и после получения замка.

## 1. Факты

- Таблицы `ProtocolVersion` (с бэкфиллом версии 1) и `ProtocolFeedback` создаёт WP-BACKEND-06; версию USER_EDIT при `PUT` пишет WP-BACKEND-01, GENERATED — WP-WORKER-01; зависимости `@fastify/multipart`, `jszip`, `fast-xml-parser` добавлены WP-BACKEND-06.
- Word: комментарии — `word/comments.xml` (`w:comment` id/author/date) + якоря `w:commentRangeStart/End` в `word/document.xml`; правки — `w:ins` (`w:t`), `w:del` (`w:delText`); mammoth комментарии по умолчанию игнорирует и правки не отдаёт.
- Файлы — S3/MinIO, URI `s3://bucket/key` (ADR-004).

## 2. Объём

1. Чтение версий протокола: список (n, kind, автор, время) и текст версии.
2. Приём отзыва: `COMMENT` (текст + необязательная категория: атрибуция спикера / пропущено решение / неверная задача / выдумано / термины-имена / стиль / другое); `CORRECTED_PROTOCOL` (текст или файл .md/.txt/.docx); `DOCX_REVIEW` (.docx ≤ 20 МБ). Файл — в S3 `ws/<workspaceId>/feedback/<id>/<имя>`; проверка расширения, mime и сигнатуры zip. Привязка к текущей версии протокола (`protocolVersionN`).
3. Разбор .docx (D-12) в `extracted`: комментарии {id, author, date, text, anchoredText}, правки {type ins|del, author, date, text}, принятый и исходный тексты; для `CORRECTED_PROTOCOL` .docx — плоский текст. Ошибка разбора не роняет приём: файл сохранён, `extracted.error`.
4. Список отзывов к встрече и скачивание файла (через проверку доступа).
5. Не делать: анализ, экспорт, UI.

### Не входит

- merge, деплой, PROD, запись в БД
- другие модули и рабочее пространство оркестратора
- файлы вне разрешённых путей; общие пути, не объявленные выше
- подъём версий и release notes, если не перечислены выше

## 3. Критерии приёмки

1. Тест разбора на фикстуре, собранной в тесте (2 комментария, 1 вставка, 1 удаление): всё извлечено с якорным текстом; битый файл → сохранён, `extracted.error`.
2. Тесты приёма трёх видов, отказ по размеру/типу, привязка к версии.
3. Тест изоляции WP-BACKEND-01 зелёный с новыми маршрутами; typecheck и тесты зелёные.

## 4. Порядок сдачи

- PR из `feature/wp-api-feedback-01-feedback` в `main`; не мержить.
- Тело PR = отчёт разработки + `Deviations` (чем результат отличается от пакета и почему).
- Затем сообщение `product-coord`: `[PRODUCT] READY WP-API-FEEDBACK-01 :: <sha> :: ref=<PR URL>`.

## 5. Start prompt

```text
Прочитай /home/cloudpc/projects/transcriber-orch/docs/orchestration/product/work-packages/WP-API-FEEDBACK-01-feedback.md и выполни. Сначала раздел 0 (подготовка worktree). Ветка feature/wp-api-feedback-01-feedback от origin/main, PR в main, не мержить. По готовности — сообщение product-coord: [PRODUCT] READY WP-API-FEEDBACK-01 :: <sha> :: ref=<PR URL>

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
cd /home/cloudpc/projects/transcriber-orch && claude -w wp-api-feedback-01-feedback --model sonnet --name product-api-feedback "Прочитай /home/cloudpc/projects/transcriber-orch/docs/orchestration/product/work-packages/WP-API-FEEDBACK-01-feedback.md и выполни. Сначала раздел 0 (подготовка worktree). Ветка feature/wp-api-feedback-01-feedback от origin/main, PR в main, не мержить. По готовности — сообщение product-coord: [PRODUCT] READY WP-API-FEEDBACK-01 :: <sha> :: ref=<PR URL>

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
- Пришли `product-coord`: `[PRODUCT] QUESTION WP-API-FEEDBACK-01 :: отказ: <точный текст отказа> :: ref=<команда>`; продолжай работу, которой это не нужно, или жди `ANSWER`.
- Ресурсы по запросу (`graph`, `dev-stack`): перед использованием пришли `product-coord`: `[PRODUCT] LOCK WP-API-FEEDBACK-01 :: <ресурс> :: ref=<зачем>` и жди `ACK`; как только закончишь — `[PRODUCT] UNLOCK WP-API-FEEDBACK-01 :: <ресурс> :: ref=<результат>`. READY возвращает все замки по запросу.

## Пересдачи

<Циклы REVISE: дата, пункты, коммит.>
