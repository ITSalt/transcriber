# Сверка — WP-WEB-PROJECTS-01 (PR https://github.com/ITSalt/transcriber/pull/19, `1147a5b9d5` -> `main @ 2570d0a669`) — 2026-10-07

Раунд 2. Дифф: 24 files changed, 2685 insertions(+), 14 deletions(-) (файлов: 24).

**Решение: `ACCEPTED WP-WEB-PROJECTS-01`** — пункты 1–3 раунда 1 закрыты кодом и тестами (диф только в `features/context/` и `/upload`, +6 тестов); CI PR #19 на `1147a5b` зелёный (Lint + Typecheck + Test, run 37697951039, 2m3s); клон: web vitest и typecheck exit 0; PR MERGEABLE. Пункт 4 (rebase на FRONTEND-02) и ключ `start.error` — в раунде rebase перед слиянием; слияние после WP-API-PROJECTS-01 и WP-WORKER-01.

## Пункты REVISE

нет. Сверка пунктов раунда 1 по диффу `d2d18ff..1147a5b` (7 файлов, +306/−13, только `features/context/` и `/upload`):

1. Неначатая встреча — новый `features/context/StartRecognitionAction.tsx` в слоте `meeting.actions` (через фрагмент вместе с `ContextSnapshotAction`): для `AWAITING_START` кнопка «Начать распознавание» открывает диалог с `ContextForm`; общая логика в `features/context/start.ts` (PUT контекста только при непустом черновике → POST /start), её же использует `/upload`. Тесты `start-action.test.tsx`: регистрация слота, старт без PUT, PUT перед стартом с телом, отсутствие кнопки после старта. Вариант «и/или localStorage» не делали — действие на карточке закрывает сценарий. Закрыт.
2. `routes/upload/index.tsx:226-231` — при `result.status === "TRANSCRIBING"` сразу `navigate` на карточку, без шага старта; тест с моком `TRANSCRIBING` и проверкой отсутствия POST /start. Закрыт.
3. `start.ts:26` — 409 → `"already-started"`, оба вызывающих переходят на карточку без ошибки; тест 409 на `/upload`. Закрыт.
4. Rebase на FRONTEND-02 — по условию раунда 1, после его merge (отдельный TASK).

### Не требуется

—

## Вопросы владельцу

нет

## Принято как есть / backlog

- Low (в раунд rebase, не отдельный раунд): ключ `start.error` используется в `StartRecognitionAction.tsx:49`, но отсутствует в `features/context/i18n/{ru,en}.json` — ветка достижима только для не-`Error` исключений (ApiError и TypeError fetch — Error), пользователь увидел бы текст ключа. Добавить ключ при rebase на FRONTEND-02.
- Наблюдатель `["meetings", id]` в слоте со `staleTime: 30_000` — принято (ключ и схема совпадают с карточкой, SSE-инвалидация обновляет).
- Backlog раунда 1 без изменений (F4 Enter в полях контекста, F6, F7, F8).
- Слот слияния: после WP-API-PROJECTS-01 и WP-WORKER-01 (в очередь добавляется при приёмке API-пакета). Перед слиянием — пересдача после rebase на FRONTEND-02 (п. 4: `useWorkspaceId()` из `lib/session.tsx`, удалить `features/projects/workspace.ts`, убрать явный `workspace_id` из тел init/complete/abort, тесты через `test-utils` сессии).
- graph: не требуется.

## Автоматические находки

- не найдено

Дифф ревизии (пересдачи): git -C /home/cloudpc/projects/transcriber diff d2d18ffef1db3ea83d8dd126faddfd655354110a 1147a5b9d5f403c66f479d1451afc099ba674e67

---

## Отчёт рецензента (дословно)

Пересдачу сверял оркестратор сам: чтение диффа ревизии (выше), CI PR #19 на `1147a5b` (pass, 2m3s) и `review_clone.sh` на том же SHA: `vitest run --testTimeout=60000` exit 0, `typecheck` exit 0. Ключи i18n `start.*` проверены в `features/context/i18n/{ru,en}.json`: есть `button`, `hintSkip`, `hintReady`, `starting`; нет `error` (backlog выше).
