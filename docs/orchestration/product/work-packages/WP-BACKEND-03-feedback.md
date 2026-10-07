# WP-BACKEND-03 — История версий протокола и приём обратной связи

| Поле | Значение |
|------|----------|
| Поток | backend (area) |
| Репозиторий | . |
| Базовая ветка | main |
| Линия | main |
| Рабочая ветка | `feature/wp-backend-03-feedback` |
| Worktree | `.claude/worktrees/wp-backend-03-feedback` (создаёт `claude -w wp-backend-03-feedback`) |
| Заголовок PR | `[PRODUCT] WP-BACKEND-03: История версий протокола и приём обратной связи` |
| Сессия | `product-backend` |
| Модель | `opus` |
| Усилие | `high` |
| Почему такая модель | миграция с бэкфиллом протоколов, разбор docx, изоляция |
| Режим | nacl, spec-first: `/nacl-sa-feature` (FR-005: ProtocolVersion, ProtocolFeedback; изменение UC-301), затем `/nacl-tl-dev-be` по TDD, `/nacl-tl-review --be` |
| Команды методологии: разрешены | nacl: `nacl-tl-dev-be`, `nacl-tl-dev`, `nacl-tl-fix`, `nacl-tl-review`, `nacl-tl-regression-test`, `nacl-tl-verify-code`, `nacl-tl-sync`, `nacl-tl-docs`, `nacl-tl-stubs`, `nacl-sa-uc`, `nacl-sa-domain`, `nacl-sa-feature`, `nacl-sa-validate`, `nacl-tl-plan`, `nacl-tl-status` |
| Команды методологии: запрещены | `nacl-tl-release`, `nacl-tl-deploy`, `nacl-tl-deliver`, `nacl-tl-hotfix`, `nacl-tl-ship`, `nacl-tl-conductor`, `nacl-tl-full`, `nacl-goal`, `nacl-publish` |
| Разрешённые пути | `api/**`, `worker/**` |
| Общие пути, которые трогает пакет | `shared/**` (Zod-схемы версий и отзывов), `api/prisma/**`, `api/package.json` + `pnpm-lock.yaml` (jszip + XML-парсер, если P-10 = a) |
| Миграции | да: `*_protocol_versions_feedback` — новые таблицы + бэкфилл: текущий `Protocol.markdownContent` каждой встречи → `ProtocolVersion` (kind=`legacy` если editCount>0, иначе `generated`) |
| Ресурсы (замки) | `migrations`, `graph` по запросу |
| Тестовая БД и порты | нет; нет |
| Слот слияния | <место в очереди слияний, задаётся при приёмке> |
| Контракт | shared feedback v1 для WP-FRONTEND-04: `GET /api/meetings/:id/protocol/versions`, `GET .../versions/:n`, `POST /api/meetings/:id/feedback` (multipart: kind, text, файл), `GET /api/meetings/:id/feedback` |
| Зависит от | WP-BACKEND-02 в main (метаданные генерации `ProtocolGeneration`) |
| Размер | M |
| Спецификация | UC-301 (изменённый), FR-005 (новый) |
| Граф | DomainEntity ProtocolVersion/ProtocolFeedback; UC-301 — через `/nacl-sa-feature` |
| Решения | D-3, D-4; P-10 (ждёт ответа) |

Общие пути этого репозитория (объяви те, что трогает пакет): `pnpm-lock.yaml`, `package.json`, `**/package.json`, `shared/**`, `api/prisma/**`, `.tl/**`, `graph-infra/**`, `config.yaml`, `CLAUDE.md`.
Ресурсы этого репозитория, требующие замка: `migrations`, `graph` (по запросу: LOCK/UNLOCK, см. раздел 6), `dev-stack` (по запросу: LOCK/UNLOCK, см. раздел 6).

## 0. Подготовка worktree

1. Переключи worktree на ветку пакета: `git fetch origin && git switch -c feature/wp-backend-03-feedback origin/main`.
2. Подготовь worktree (команды из `orch.yaml`, выполнять внутри worktree):

   ```bash
   pnpm install --frozen-lockfile
   pnpm --filter @transcrib/api run db:generate
   ```
3. Правь только разрешённые пути; общие пути — только объявленные в шапке и после получения замка.

## 1. Факты

- `PUT /api/meetings/:id/protocol` перезаписывает `markdownContent`, растит version/editCount (`api/src/services/uc-301.service.ts:6,79-82`); 409 вне PROTOCOL_READY/EDITED (`:9`); истории нет — исходный ответ LLM теряется после первой правки.
- Библиотек docx нет ни в одном `package.json`. Комментарии Word: `word/comments.xml` (`w:comment` с id/author/date) + якоря `w:commentRangeStart/End` в `word/document.xml`; правки — `w:ins` (`w:t`) и `w:del` (`w:delText`); mammoth комментарии по умолчанию игнорирует и правки не отдаёт.
- Файлы уже хранятся в S3/MinIO с URI `s3://bucket/key` (ADR-004).

## 2. Объём

1. `ProtocolVersion(meetingId, n, kind: generated|user_edit|legacy, markdown, authorUserId?, generationId?, createdAt)` — неизменяемые строки; при генерации пишется версия `generated`, при каждом `PUT` — новая `user_edit`; `Protocol.markdownContent` остаётся текущим текстом (обратная совместимость).
2. `ProtocolFeedback(meetingId, workspaceId, userId, protocolVersionN, kind: comment|corrected_protocol|docx_review, category enum?, text?, fileUri?, fileName, mime, sizeBytes, extracted JSONB?, createdAt)`. Категории для `comment` (необязательно): атрибуция спикера / пропущено решение / неверная задача / выдумано / термины-имена / стиль / другое.
3. Приём: текст; исправленный протокол — текстом или файлом .md/.txt/.docx; Word с комментариями — .docx ≤ 20 МБ. Файлы — в S3 `ws/<workspaceId>/feedback/<id>/<имя>`; проверка mime/расширения и сигнатуры zip для docx.
4. По P-10 (a): извлечение из .docx в `extracted`: комментарии {id, author, date, text, anchoredText}, правки {type ins|del, author, date, text}, принятый и исходный тексты. Ошибка разбора не роняет приём — файл сохраняется, `extracted.error`.
5. Ко всем отзывам — ссылка на версию протокола и через неё на `ProtocolGeneration` (модель, версия промпта, снимок контекста).
6. Изоляция по пространству (тест BACKEND-01 расширить).
7. Не делать: анализ отзывов, изменение промпта по ним, экспорт.

### Не входит

- merge, деплой, PROD, запись в БД
- другие модули и рабочее пространство оркестратора
- файлы вне разрешённых путей; общие пути, не объявленные выше
- подъём версий и release notes, если не перечислены выше

## 3. Критерии приёмки

1. Тест: генерация → версия 1 `generated`; два PUT → версии 2, 3; версия 1 неизменна (сравнение байт).
2. Тест миграции: существующие протоколы получают версию (kind по editCount).
3. Тест разбора .docx на фикстуре с 2 комментариями, 1 вставкой и 1 удалением (фикстуру создать в тестах): извлечено всё с якорным текстом; битый файл → сохранён, `extracted.error`.
4. Тест изоляции: чужой отзыв/версия → 404. Typecheck и тесты зелёные.
5. SELECT после локального прогона: строки ProtocolFeedback трёх видов, объекты в MinIO.

## 4. Порядок сдачи

- PR из `feature/wp-backend-03-feedback` в `main`; не мержить.
- Тело PR = отчёт разработки + `Deviations` (чем результат отличается от пакета и почему).
- Затем сообщение `product-coord`: `[PRODUCT] READY WP-BACKEND-03 :: <sha> :: ref=<PR URL>`.

## 5. Start prompt

```text
Прочитай /home/cloudpc/projects/transcriber-orch/docs/orchestration/product/work-packages/WP-BACKEND-03-feedback.md и выполни. Сначала раздел 0 (подготовка worktree). Ветка feature/wp-backend-03-feedback от origin/main, PR в main, не мержить. По готовности — сообщение product-coord: [PRODUCT] READY WP-BACKEND-03 :: <sha> :: ref=<PR URL>

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
cd /home/cloudpc/projects/transcriber-orch && claude -w wp-backend-03-feedback --model opus --effort high --name product-backend "Прочитай /home/cloudpc/projects/transcriber-orch/docs/orchestration/product/work-packages/WP-BACKEND-03-feedback.md и выполни. Сначала раздел 0 (подготовка worktree). Ветка feature/wp-backend-03-feedback от origin/main, PR в main, не мержить. По готовности — сообщение product-coord: [PRODUCT] READY WP-BACKEND-03 :: <sha> :: ref=<PR URL>

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
- Пришли `product-coord`: `[PRODUCT] QUESTION WP-BACKEND-03 :: отказ: <точный текст отказа> :: ref=<команда>`; продолжай работу, которой это не нужно, или жди `ANSWER`.
- Ресурсы по запросу (`graph`, `dev-stack`): перед использованием пришли `product-coord`: `[PRODUCT] LOCK WP-BACKEND-03 :: <ресурс> :: ref=<зачем>` и жди `ACK`; как только закончишь — `[PRODUCT] UNLOCK WP-BACKEND-03 :: <ресурс> :: ref=<результат>`. READY возвращает все замки по запросу.

## Пересдачи

<Циклы REVISE: дата, пункты, коммит.>
