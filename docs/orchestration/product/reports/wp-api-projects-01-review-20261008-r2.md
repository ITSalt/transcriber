# Сверка — WP-API-PROJECTS-01 (PR https://github.com/ITSalt/transcriber/pull/20, `17bdd3261e` -> `main @ 7f3b99b622`) — 2026-10-08

Раунд 2. Дифф: 9 files changed, 855 insertions(+), 2 deletions(-) (файлов: 9).

**Решение: `ACCEPTED WP-API-PROJECTS-01`** — пункт 1 раунда 1 закрыт кодом (+3 строки service.ts, +3 errors.ts) и тестами (50 001 → 422 с откатом; +27 строк тестов), граф и документы дополнены; CI PR #20 на `17bdd3261e` зелёный (Lint + Typecheck + Test, run 37766507835, 2m28s); сессия: api 278/278, shared 122/122, typecheck 4/4. Перед доставкой — ещё одно слияние с main (в main влит API-FEEDBACK-01), сверяется как rebase.

## Пункты REVISE

нет. Сверка пунктов раунда 1 по диффу `1c05fcb..17bdd32`:

1. `api/src/features/context/service.ts:161-162` — до сборки снимка `last.markdown.length > PREVIOUS_PROTOCOL_MAX_CHARS` → `programError('PREVIOUS_PROTOCOL_TOO_LONG')` внутри транзакции (откат, очередь не вызывается); `shared/src/api/errors.ts` — код 422 и сообщение «Протокол проекта длиннее 50 000 символов — выберите «без протокола» или вставьте фрагмент» (A-9); тесты: `context.db.test.ts` (+20: 50 001 → 422, статус `AWAITING_START`), `program-contract.test.ts` (+7). Закрыт.
2. Документы: `.tl/feature-requests/FR-004-projects-meeting-context.md` (+15/−1), `.tl/changelog.md` (+11, замок ваш). Граф: `RQ-047` и `DEC-011` содержат `PREVIOUS_PROTOCOL_TOO_LONG` (read-cypher). Закрыт.
3. Слияние с main: `origin/main` — предок `17bdd32`. Закрыт; после слияния API-FEEDBACK-01 (идёт) потребуется ещё одно `git merge origin/main` перед доставкой.

### Не требуется

—

## Вопросы владельцу

нет

## Принято как есть / backlog

- Backlog раунда 1 без изменений (комментарий `project.ts:18`, гонка P2025, info 4–7).
- Диф кода пересдачи — 4 файла, +33: только пункт 1; остальное — `.tl` и слияние с main.
- graph: checked — RQ-047/DEC-011 дополнены кодом ошибки (read-cypher 2026-10-08), остальное как в раунде 1.
- Слот слияния: после WP-API-FEEDBACK-01; WEB-PROJECTS-01 — после этого пакета (его rebase: `useWorkspaceId()`, `start.error`, и теперь ещё показ сообщения `PREVIOUS_PROTOCOL_TOO_LONG` из API — ошибки отображаются по тексту, отдельной правки не требуется).

## Автоматические находки

- **пути и замки**: WP-API-PROJECTS-01: shared path .tl/changelog.md changed but not declared
- **пути и замки**: WP-API-PROJECTS-01: .tl/feature-requests/FR-004-projects-meeting-context.md is outside the allowed paths
- **пути и замки**: WP-API-PROJECTS-01: shared path shared/src/api/context.ts changed but not declared
- **пути и замки**: WP-API-PROJECTS-01: shared path shared/src/api/errors.ts changed but not declared
- **пути и замки**: WP-API-PROJECTS-01: shared path shared/src/api/program-contract.test.ts changed but not declared
- Все пять путей разрешены: `shared/src/api/context.ts` и `program-contract.test.ts` — A-8, `shared/src/api/errors.ts` — A-9, `.tl/changelog.md` (замок за пакетом) и FR-004 md — ANSWER после UNLOCK graph; не находки.
- **merge-base**: WP-API-PROJECTS-01: branch point 40d6ba5bc2 is 1 commits behind origin/main (no overlapping files) - rebase before merge

Дифф ревизии (пересдачи): git -C /home/cloudpc/projects/transcriber diff 1c05fcbbdc3d2657cede02aa013c717d1ff2dd23 17bdd3261e19e2952d321727c91ea012f3d3e783

---

## Отчёт рецензента (дословно)

Пересдачу сверял оркестратор сам: `git diff --stat 1c05fcb 17bdd32 -- api/ shared/` — 4 файла, +33 (service.ts +3, errors.ts +3, два теста); `git diff --stat origin/main 17bdd32 -- . ':!api/' ':!shared/'` — только `.tl/changelog.md` и FR-004 md; `git merge-base --is-ancestor origin/main 17bdd32` — да; граф — Cypher по MCP neo4j. CI — в строке решения.
