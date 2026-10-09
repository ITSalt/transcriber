# Сверка — WP-BACKEND-08 (PR https://github.com/ITSalt/transcriber/pull/39, `731ea379f9` -> `main @ 75676ba117`) — 2026-10-09

Раунд 1. Дифф: 21 files changed, 152 insertions(+), 48 deletions(-) (файлов: 21).

**Решение: `REVISE WP-BACKEND-08`** — код полный и доказан тестами (DB-тесты на PG16 выполнены, 4 мутации пойманы, CI зелёный), но пакет в таком виде нельзя доставить: это первая деструктивная миграция репозитория, а прод-воркфлоу выполняет `prisma migrate deploy` за несколько минут до рестарта pm2 — в это окно старые api/worker падают на `transcription_jobs` (500 на карточке встречи, загрузке и старте; задание распознавания исчерпывает 3 попытки за ~15 с и встреча зависает в TRANSCRIBING). Решение оркестратора: expand/contract — код сейчас, `DROP COLUMN` отдельным PR после выхода кода; плюс незакрытый пункт 4 объёма (граф).

## Пункты REVISE

1. `api/prisma/migrations/20261009130000_drop_speaker_count/**`, `api/prisma/schema.prisma` → миграция в одном деплое с кодом: `.github/workflows/deploy-production.yml:61` (`db:migrate:deploy`) раньше `:104-105` (`pm2 start`); старый Prisma-клиент выбирает все колонки → P2022 на `GET /api/meetings/:id`, `POST /api/uploads/complete`, `POST /api/meetings/:id/start`, `worker/src/jobs/transcription.ts:160` → правило `.tl/deploy-plan.md:144` («деструктивных миграций не делаем») и критерий 3 (загрузка и старт работают). Требование: в этом PR оставить только код — поле `speakerCount Int?` в `schema.prisma` вернуть с комментарием «не используется, удаляется следующей миграцией (D-43)», каталог миграции и `drop-speaker-count.down.db.test.ts` из PR убрать (сохранить локально); после доставки и проверки этого PR на проде — второй PR `WP-BACKEND-08` раунд «contract»: удаление поля из схемы + та же миграция + down.sql + DB-тест + строка в `.tl/deploy-plan.md` §5 (замок `.tl/{…deploy-plan.md}` выдам по LOCK) и правка строки 144 про деструктивные миграции (теперь — только отдельным деплоем после выхода кода). Серьёзность: High (операционная).
2. Граф (пункт 4 объёма): UC-002 (проект в карточке), UC-100 (без поля числа спикеров — проверить, WP-SPEC-01 мог убрать), ent-003 TranscriptionJob (атрибут speaker_count) через `/nacl-sa-uc` под замком `graph` (пришли `LOCK graph`), согласовать с WP-SPEC-01 не нужно — он завершён. Серьёзность: Medium (spec-first).

### Не требуется

- Менять `.default(null)` у `project_id`/`project_name` — оставить; снимет WP-FRONTEND-08 вместе с фикстурами web.
- Тест маршрута `/api/uploads/init` на лишнее поле — схемного теста достаточно.
- Трогать `web/src/i18n/**` (мёртвые ключи `fieldSpeakerCount*`) — WP-FRONTEND-08.

## Вопросы владельцу

нет

## Принято как есть / backlog

- Deviations 1 (grep в двух тестовых файлах), 2 (`.default(null)` — с передачей WP-FRONTEND-08), 4 (`deepgram.md` не упоминает число спикеров — проверено), 5 (AGENTS.md — D-17), 6 (`speaker_count` был только в `UploadCompleteRequest` — проверено по base) — приняты.
- Изоляция пространств в join проекта: `assertMeetingAccess` до сервиса, писатель `projectId` проверяет пространство (`context/routes.ts:33-37`) — утечки `project_name` через API нет.
- Backlog: мёртвые ключи `web/src/i18n` `fieldSpeakerCount*`/`errorSpeakerCountRange` (в WP-FRONTEND-08 уже запланировано).

## Автоматические находки

- **пути и замки**: WP-BACKEND-08: api/src/features/context/context.db.test.ts is outside the allowed paths
- **пути и замки**: WP-BACKEND-08: api/src/features/context/service.ts is outside the allowed paths
- **merge-base**: WP-BACKEND-08: branch point 655830416e is 2 commits behind origin/main (no overlapping files) - rebase before merge

Дифф ревизии (пересдачи): —

---

## Отчёт рецензента (дословно)

Verdict: ACCEPT with condition (orchestrator turned the condition into REVISE: split the destructive migration into a second deploy). Scope: `MeetingDetail` += project fields (`shared/src/api/uc002.ts:12-13`, `uc-002.service.ts:38,68-69`, tests `uc-002.test.ts:107-121`); `speaker_count` removed end-to-end (uc100/uc200 contracts, services UC-100/UC-004, `upload-complete.ts`, `features/context/service.ts:127,141,206,213` — exactly four lines, speakerCount only; Prisma field); migration `DROP COLUMN IF EXISTS` + idempotent down.sql (BEGIN/ADD COLUMN IF NOT EXISTS/DELETE FROM _prisma_migrations/COMMIT) + db test; legacy field stripped (`upload-legacy-field.test.ts`, `auth-isolation.db.test.ts:506` → 200); `deepgram.md` has no speaker-count mention; scope item 4 (graph) not done. All 21 files inside allowed/declared/ACKed paths.

Deploy-order risk: `deploy-production.yml:51-105` runs `db:migrate:deploy` before builds and `pm2 start`; the workflow comment (:59) and `.tl/deploy-plan.md:144` assume additive-only migrations. In the window old api full-row selects/inserts on `transcription_jobs` fail (P2022): `GET /api/meetings/:id`, `POST /api/uploads/complete` (tx rolls back), `POST /api/meetings/:id/start`; old worker `transcription.ts:160` `findUnique({include})` fails, FAILED write also fails (`:401`), rethrow → BullMQ 3 attempts/5 s backoff (~15 s) → DB row PENDING, meeting TRANSCRIBING stuck. `worker/src` has no speakerCount on base/head — the issue is the generated client's column list. Options: quiet window + pg_dump, or split DROP into a follow-up deploy. `.tl/deploy-plan.md` §5 lacks the rollback row (shared path not declared).

Contracts: `@fastify/type-provider-zod@1.0.0` serializer uses `safeEncode`; `.default(null)` does not fill the response (server always sets `?? null`); web `safeParse` fills null when absent; inferred TS type `string | null` required. `UploadCompleteRequest` is a plain `z.object` — stripped body; mutation (c) with `.strict()` → 400 "Unrecognized key". Isolation: `assertMeetingAccess` (`access.ts:32-40`) precedes the service; `PUT /context` enforces same-workspace project (`context/routes.ts:33-37`).

CI pass 1m53s, MERGEABLE/CLEAN; 21 files +152/−48. Clone `orch-review.CU0z2l`: setup exit 0; api tests 279 passed | 84 skipped (DB suites skipped without DATABASE_URL); `pnpm -r typecheck` exit 0; `pnpm test` 1178 passed | 104 skipped. DB suites executed on embedded PG16 (127.0.0.1:55432, `db:migrate:deploy` applied incl. drop_speaker_count): api `31 passed | 1 skipped` files, `356 passed | 7 skipped` tests. Merged head+main (376cfd1): typecheck Done x4, `pnpm test` with DB 1261 passed | 27 skipped. Mutations: (a) join removed → uc-002 test fails; (b) down.sql no-op → down test fails; (b2) migration.sql no-op → both tests fail (drift); (c) `.strict()` → legacy-field test and auth-isolation defer_start test fail (400). Cleanup: embedded PG stopped and removed, clone removed, module checkout untouched, nothing pushed/merged/commented.
