# Сверка — WP-API-FEEDBACK-01 (PR https://github.com/ITSalt/transcriber/pull/21, `a7798d4fc4` -> `main @ ae76dda3e3`) — 2026-10-08

Раунд 1. Дифф: 5 files changed, 1107 insertions(+) (файлов: 5).

**Решение: `ACCEPTED WP-API-FEEDBACK-01`** — все 5 маршрутов контракта реализованы по `shared/src/api/feedback.ts`, критерии 1–3 подтверждены тестами (api 256 passed, auth-isolation 23/23 на PG16 с новыми маршрутами) и 8 из 10 мутаций, ядро и общие пути не тронуты, потребитель WEB-FEEDBACK-01 совпадает 1:1; CI run 37763860894 pass; находки — low/info в backlog. Условия слияния: (1) .tl-правки (FR-005 md, api-contract UC-303..305, status.json) + `git merge origin/main` одним коммитом → READY с новым SHA, сверяется как rebase; (2) P-17 (401 для легаси-принципала) — ответ владельца нужен до доставки WEB-FEEDBACK-01, не этого пакета.

## Пункты REVISE

нет

### Не требуется

- Не менять код до ответа P-17; не трогать ядро (`upload-*.ts`, logger) — находка 3 (объект ошибки S3 в `details`) — конвенция базы, backlog ядра.
- Не делать стриминговую распаковку docx (находка 2) — принят риск: загрузить может только вошедший член пространства.

## Вопросы владельцу

- P-17 — отзыв только от вошедшего пользователя (DEC-012, RQ-065): при `AUTH_REQUIRED=false` POST → 401. Рекомендация (a): включить вход (R-16) до доставки WEB-FEEDBACK-01.

## Принято как есть / backlog

- Low 1: `extracted` не ограничен по размеру (`routes.ts:133`, `docx.ts:17`) — до 20 МБ текста в JSONB и в ответе 201; backlog: обрезка до `FEEDBACK_TEXT_MAX` или не возвращать `extracted` в 201.
- Low 2: проверка zip-бомбы по `uncompressedSize` из central directory до распаковки, подделанный размер ловится после инфляции; риск принят.
- Info 3: объект ошибки S3 в `details` 500 — конвенция ядра, backlog ядра. Info 4: GET версий без хендлер-гарда `meetingAccess` (изоляцию держит onRequest-хук, подтверждено DB-тестом; добавить для единообразия при следующем касании). Info 5: мок `findFirst` зависит от формы `where`.
- Отклонения PR приняты: нет версии → 404 `PROTOCOL_VERSION_NOT_FOUND`; D-17; большой файл на реальном MinIO не проверен (E2E после merge).
- graph: checked — read-cypher 2026-10-08 после UNLOCK: `UC-303` «Посмотреть версии протокола», `UC-304` «Оставить отзыв на протокол», `UC-305` «Посмотреть отзывы и скачать файл» — spec_version 2, detail complete, шаги 5/7/4; `RQ-065`, `DEC-012` accepted; `RQ-052/053` дополнены; `FR-005` без изменений. Formы UC-303..305 (has_ui) — за WEB-FEEDBACK-01 (backlog `/nacl-sa-ui`).
- Слот слияния: впереди WORKER-MEMORY-01/WEB-MEMORY-01 (те ждут P-18); после API-PROJECTS-01 или до — по готовности; WEB-FEEDBACK-01 — после этого пакета.
- Сбой инструмента: клон `review_clone.sh --sha a7798d4` оказался на `1c05fcb` (см. отчёт; разбирается как PLUGIN-BUG-4), рецензент перепроверил `git checkout a7798d4`; `review_setup` не собирает `shared` — 17 тест-файлов api падают до `pnpm --filter @transcrib/shared build` (добавить в `orch.yaml review_setup`).

## Автоматические находки

- **merge-base**: WP-API-FEEDBACK-01: branch point fd9ca659f0 is 1 commits behind origin/main (no overlapping files) - rebase before merge

Дифф ревизии (пересдачи): —

---

## Отчёт рецензента (дословно)

## Review report — PR #21, WP-API-FEEDBACK-01

**Head:** `a7798d4fc4531d0a7dd6709a486626a66d1af29e`, base `main @ ae76dda3e3`, merge-base `fd9ca659f0` (ветка на 1 коммит позади main; пересечений по файлам нет — дифф `ae76dda..a7798d4` показывает 30 файлов только из-за PR #13 в main, собственный дифф PR = 5 файлов, +1107/-0, все в `api/src/features/feedback/`).

**Вердикт: ACCEPTED** — все 5 маршрутов контракта реализованы строго по `shared/src/api/feedback.ts`, критерии приёмки 1–3 подтверждены тестами и 9 мутациями, изоляция WP-BACKEND-01 проверена на настоящем PG16 (23/23 с новыми маршрутами), ядро не тронуто; найденные замечания — low/info в backlog.

### Нумерованные находки

1. **low** — `api/src/features/feedback/routes.ts:133` и `docx.ts:17`. Размер `extracted` не ограничен: для `.md/.txt` `plain_text` = весь файл (до 20 МБ), для `.docx` `accepted_text`/`original_text` — до 64 МБ на XML-часть. Сценарий: пользователь загружает 15 МБ `.txt` как CORRECTED_PROTOCOL → 15 МБ уходит в JSONB `protocol_feedback.extracted` и целиком эхом в ответе 201 (`FeedbackCreateResponse.extracted`), который web парсит Zod'ом. Требование (backlog): обрезать извлечённый текст до `FEEDBACK_TEXT_MAX` (200 000 символов) с пометкой в `extracted`, или не возвращать `extracted` в 201 (web в списке использует только `extracted_counts`).
2. **low** — `docx.ts:50-53`. Заявленная «защита от zip-бомбы» проверяет размер **до** распаковки только по `uncompressedSize` из central directory (`_data` — приватное поле JSZip; проверил: для сгенерированного zip оно присутствует и равно фактическому, 13000=13000). Для специально подделанного архива с ложным заявленным размером JSZip распакует всё в память и только потом бросит «size mismatch» — проверка на строке 53 срабатывает после инфляции. Атакующий — только аутентифицированный член workspace, поэтому low. Требование: нет (backlog: стриминговая распаковка с лимитом, либо принять риск).
3. **info** — `routes.ts:299, 362`. `new AppError('STORAGE_WRITE_FAILED', 500, …, err)` — объект ошибки S3 попадает в `details` ответа (для сетевых ошибок — `address/port` MinIO). Это та же конвенция, что в базе (`api/src/routes/upload-init.ts:60,73`, `upload-complete.ts:67`), поэтому не регрессия и не требование к пакету; кандидат в backlog для ядра.
4. **info** — `routes.ts:203, 229`. Оба GET версий не проверяют `request.meetingAccess` (в отличие от трёх остальных, строки 262/336/349) и фильтруют только по `meetingId`. Изоляция держится на onRequest-хуке auth-плагина (гейт по шаблону маршрута `/api/meetings/:id`), что подтверждено DB-тестом; мутация M8 показала, что хендлер-гард в download — лишь defense-in-depth. Для единообразия стоит добавить `if (!request.meetingAccess) throw notFound()` в оба GET; не блокирует.
5. **info** — `routes.test.ts`, мок `protocolFeedback.findFirst`. Тест «чужой feedback недоступен через свою встречу» зелёный и при удалении фильтра (мутация M1 ловится только через happy-path, т.к. мок при `where.meetingId === undefined` не находит ничего). Покрытие достаточное (M1 красная), но семантика мока связана с формой `where`.
6. **info** — Deviation 1 (легаси-принципал D-20 → 401 на POST): `routes.ts:260`. Поведение осознанное, `ProtocolFeedback.user_id NOT NULL` (схема BACKEND-06), на проде вход включён (R-16). Чтение версий/списка для легаси работает (хук отдаёт `meetingAccess` для «Романа»).

Регрессий относительно базы нет: PR только добавляет файлы, `git diff --stat fd9ca659f0 a7798d4 -- worker shared api/src/server.ts api/prisma` пуст; общие пути не тронуты; секретов и логирования содержимого файлов нет (в `routes.ts` нет вызовов логгера; `plugins/logger.ts` с redact не менялся).

### Критерии приёмки / объём → доказательство

| Пункт | Где | Статус |
|---|---|---|
| 2.1 список версий (n, kind, автор, время) + текст версии | `routes.ts:203-253`; `current_n` = max n (:223); n вне `[1..2^31-1]`/не число → 404 `PROTOCOL_VERSION_NOT_FOUND` (:231-233) | OK, тесты «lists versions…», «returns the text…» |
| 2.2 приём COMMENT/CORRECTED_PROTOCOL/DOCX_REVIEW, категория, файл .md/.txt/.docx, ≤20 МБ | `routes.ts:257-331`; правила вида через `checkFeedbackSubmission` (shared); ext+mime (incl. `application/octet-stream`) из `FEEDBACK_FILE_TYPES`; сигнатура zip `.docx` :269; лимит multipart `fileSize` :192 + повторная проверка размера → 413 | OK, 5 тестов приёма + 4 отказа |
| 2.2 S3 `s3://bucket/ws/<ws>/feedback/<id>/<имя>` (ADR-004) | `routes.ts:295`, `keyToStorageUri`; имя санитизируется (`safeFileName`, :60-69); при падении записи в БД объект удаляется (:325) | OK, тесты «…stored in S3 under ws/…», «sanitises…», «removes the stored file…» |
| 2.2 привязка к текущей версии | `routes.ts:274-279, 312` — `max(n)` из `ProtocolVersion` (хук BACKEND-01 «PUT создаёт ProtocolVersion» соблюдён, параллельной истории нет); нет версии → 404 | OK, мутации M4/M4b красные |
| 2.3 разбор .docx (D-12): комментарии с anchored_text, ins/del, accepted/original, plain_text для CORRECTED; ошибка не роняет приём | `docx.ts` (jszip + fast-xml-parser, XMLValidator :33); `extractDocxReview`/`extractDocxPlainText`; `extractFailed` | OK |
| 2.4 список отзывов + скачивание через проверку доступа | `routes.ts:334-371`; фильтр `meetingId+workspaceId` (:351); `attachment` + `nosniff` + `Content-Length` | OK |
| 2.5 не делать анализ/экспорт/UI | в диффе отсутствуют | OK |
| КП-1 фикстура 2 комм./1 ins/1 del + битый файл | `docx.fixture.ts` (собрана в тесте), `docx.test.ts` 11 тестов; битый → `error`, файл сохранён (`routes.test.ts` «a broken .docx…») | OK |
| КП-2 три вида, отказ по размеру/типу, привязка к версии | `routes.test.ts` 21 тест | OK |
| КП-3 изоляция WP-BACKEND-01 зелёная с новыми маршрутами; typecheck/тесты зелёные | `api/test/auth-isolation.db.test.ts` 23/23 на PG16 в клоне; маршруты берутся из Fastify (`onRoute`), параметры `n`/`feedbackId` классифицированы в `KNOWN_PARAMS` как дети уже проверенной встречи; `POST …/feedback` и `GET …/file` в scoped-списке «user B → 404 = nonexistent» | OK |

Соответствие потребителю (WEB-FEEDBACK-01, `web/src/features/feedback/api.ts` на `origin/feature/wp-web-feedback-01-feedback`): web шлёт `kind`, `category`, `text`, `file` multipart'ом без Content-Type — API читает именно эти поля (`parseFields`, пустые строки отбрасывает — соответствует неполным формам); web парсит `FeedbackCreateResponse`, `FeedbackListResponse`, `ProtocolVersionListResponse`, `ProtocolVersionResponse` — API возвращает их формы 1:1; `download_path` строится как `/api/meetings/:id/feedback/:feedbackId/file` (routes.ts `toItem`). A-7: web берёт «исходную» как первый `GENERATED` из списка (`VersionHistoryDialog.tsx:25`) — API отдаёт `kind` и список по возрастанию n, код API менять не нужно. Ошибки — из `PROGRAM_ERRORS` (`shared/src/api/errors.ts:31-35`: 404/400/400/415/413), `UNAUTHENTICATED` 401, `NOT_FOUND` 404; литеральные `VALIDATION_ERROR`/`STORAGE_*` — конвенция ядра.

### Утверждения тела PR

- «Всё в `api/src/features/feedback/**`, общие файлы не тронуты» — **подтверждено** (diff-stat: 5 файлов).
- Маршруты и коды ошибок — **подтверждено** построчно (выше).
- «Защита от zip-бомбы» — **частично**: см. находку 2.
- typecheck зелёный; vitest api 256 passed / 41 skipped — **подтверждено** (те же числа в клоне).
- auth-isolation 23/23 на PG16 — **подтверждено** независимо на одноразовом embedded PG16.
- Критерии 1 и 2 — **подтверждено**.
- Deviation 1 (легаси → 401) — принята как есть, причина верна (схема NOT NULL, миграции пакету запрещены); решение о nullable `user_id`/служебном пользователе — владельцу.
- Deviation 2 (нет версии → 404 `PROTOCOL_VERSION_NOT_FOUND`) — принята; отдельного кода в контракте нет.
- Deviation 3 (`AGENTS.md` отсутствует, `instructions check` → false) — не проверял; вне кода, координатору.
- Deviation 4 (`/nacl-sa-feature` не выполнен, граф не заведён) — не проверял; см. строку «graph».
- Deviation 5 (поток большого файла на реальном MinIO не проверен) — принята; в клоне тоже только мок (MinIO недоступен ревьюеру).

### Мутации (клон на a7798d4, `vitest run src/features/feedback`, 32 теста)

| # | Мутация | Результат |
|---|---|---|
| M1 | download: `where` без `meetingId/workspaceId` | **красная** (1: happy-path download) |
| M2 | пропуск `checkFeedbackSubmission` (любой тип/вид) | **красная** (3) |
| M3a | только лимит multipart `fileSize ×2` | зелёная — размер дублирует проверка `sizeBytes` в `checkFeedbackSubmission` |
| M3b | лимит ×2 + подмена `sizeBytes` | **красная** (1: «over 20 MB → 413») |
| M4 | `protocolVersionN = 1` вместо `current.n` | **красная** (2) |
| M4b | приём без `ProtocolVersion` | **красная** (1) |
| M5 | убрать проверку сигнатуры zip | **красная** (1) |
| M6 | anchored_text включает удалённый текст | **красная** (2: docx + routes) |
| M7 | `current_n` = первая версия | **красная** (1) |
| M8 | убрать хендлер-гард `if (!access)` в download | зелёная — изоляцию обеспечивает onRequest-хук (defense-in-depth, находка 4) |

### Клон, тесты, CI

- **Дефект инструмента:** `review_clone.sh --sha a7798d4…` склонировал `1c05fcbbdc` (ветка API-PROJECTS-01, без `features/feedback`) — первый прогон (224 passed) не засчитан; в одноразовом клоне выполнил `git checkout a7798d4` и повторил setup. Также setup из брифа не собирает `shared` — без `pnpm --filter @transcrib/shared build` падают 17 тест-файлов api и typecheck worker (`TS6305 shared/dist`); после сборки всё зелёное. Это окружение, не дефект PR.
- `pnpm --filter @transcrib/api test` (a7798d4): **Test Files 21 passed | 4 skipped; Tests 256 passed | 41 skipped**, exit 0 (`feedback/routes.test.ts` 21, `feedback/docx.test.ts` 11).
- `pnpm -r typecheck`: shared/worker/api/web — Done, exit 0.
- DB-тесты: dev-stack Postgres 5432/5433 и MinIO 9000 ревьюеру недоступны (политика); fallback — `embedded-postgres@16.14.0-beta.17` в scratchpad на 127.0.0.1:55434 (песочница блокировала сокеты, запуск вне её). `auth-isolation.db.test.ts`: **23 passed**, exit 0. Полный прогон с `DATABASE_URL`: 12 падений `prisma.smoke`/`program-schema` из-за немигрированной scratch-БД («table public.meetings does not exist»); после `prisma migrate deploy` — smoke 7, program-schema 5, migrations.down 6: **18 passed**, exit 0. Итого с БД: 297/297.
- CI «Lint + Typecheck + Test»: **pass** (2m10s), run 37763860894.
- Размер: 5 файлов, +1107/-0.
- **Автонаходка merge-base**: ветка на 1 коммит позади `origin/main` (PR #13, web-only) — конфликтов нет, перед слиянием rebase/merge по регламенту.

### Очистка

- Scratch PG16 остановлен и `pgdata` удалён (порт 55434 свободен).
- Клон удалён: `review_clone.sh --cleanup /tmp/orch-review.LQk4dw` → «removed», каталог отсутствует.
- Основной checkout `/home/cloudpc/projects/transcriber` я не менял (только `git show/diff/fetch`); там есть посторонняя правка `config.yaml` от 2026-10-07 12:38 — до начала этой сверки.
- Ничего не отправлено в PR, ничего не запушено.

**graph:** спец-граф (Neo4j, UC-301/FR-005) я НЕ проверял — это делает оркестратор; Deviation 4 PR об отсутствии UC в графе остаётся на его сверку.

