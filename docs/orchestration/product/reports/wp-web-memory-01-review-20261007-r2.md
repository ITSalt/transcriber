# Сверка — WP-WEB-MEMORY-01 (PR https://github.com/ITSalt/transcriber/pull/14, `b404424afc` -> `main @ 2570d0a669`) — 2026-10-07

Раунд 2. Дифф: 14 files changed, 1529 insertions(+) (файлов: 14).

**Решение: `ACCEPTED WP-WEB-MEMORY-01`** — пересдача 1 закрыла оба пункта точечно (5 файлов, +85/−14), CI зелёный.

## Пункты REVISE

нет

### Не требуется

—

## Вопросы владельцу

нет

## Принято как есть / backlog

- Как в раунде 1: M-1 аутлет `protocol.toolbar` — WP-WEB-FEEDBACK-01 п. 8; L-3 a11y вкладок и Info — backlog; E2E/скриншоты — при доставке после API-MEMORY-01 и WEB-PROJECTS-01.
- Слот слияния: после WP-API-MEMORY-01 и WP-WEB-PROJECTS-01.
- graph: не требуется.

## Автоматические находки

- не найдено

Дифф ревизии (пересдачи): git -C /home/cloudpc/projects/transcriber diff dd0ee730e57fc918cbed30dd72705fd4a6b3b00f b404424afc15dc8453157504f31678b1f271e41a

---

## Отчёт рецензента (дословно)

Пересдачу сверил оркестратор (без агента-рецензента).

Дифф ревизии `dd0ee73..b404424`: 5 файлов, +85/−14, все в `web/src/features/memory/**`.
- Пункт 1: `api.ts` — `useReviewEvent` и `usePatchTask` инвалидируют `["memory", projectId]` в `onSettled` (комментарий: 409/404 означает, что сервер ушёл вперёд — перезапросить в любом случае).
- Пункт 2: состояние `saved` поднято в `TaskDetail` (над ключуемой формой); форма получает `saved/onSaved/onEdit`; `onSaved` передан в хук `usePatchTask` (срабатывает и при перемонтировании); `TaskDetail` ключуется `selectedCode` в `TasksTab`, чтобы состояние не переносилось между задачами.
- `memory.test.tsx` +58/−6: мок перезапроса возвращает обновлённую задачу (новый `updated_at`), проверки «Сохранено после перезапроса» и «409 → очередь перезапрошена».
CI: run 37694155407 pass (1m51s).
