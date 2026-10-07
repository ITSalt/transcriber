# Сверка — WP-WEB-FEEDBACK-01 (PR https://github.com/ITSalt/transcriber/pull/18, `1b52d6aee9` -> `main @ 2570d0a669`) — 2026-10-07

Раунд 2. Дифф: 12 files changed, 1650 insertions(+), 5 deletions(-) (файлов: 12).

**Решение: `ACCEPTED WP-WEB-FEEDBACK-01`** — все 5 пунктов раунда 1 закрыты кодом и тестами (диф ревизии только в фиче feedback и странице протокола, +5 тестов); CI PR #18 на `1b52d6a` зелёный (Lint + Typecheck + Test, run 37697596048, 1m46s); PR MERGEABLE. Слияние — после WP-API-FEEDBACK-01 (в очередь добавляется при его приёмке).

## Пункты REVISE

нет. Сверка пунктов раунда 1 по диффу `966f21b..1b52d6a` (6 файлов, +130/−8, только feedback-фича, страница протокола и её тесты):

1. Тест аутлета — `routes/protocol/index.test.tsx` «renders protocol.toolbar slot components in the action bar»: `renderProtocolPage` принимает реестр, временный компонент слота найден и его родитель содержит `btn-edit`. Закрыт.
2. Тест инвалидации — «invalidates the version history after Save»: spy на `client.invalidateQueries`, после Save ожидается `["protocol-versions", id]`. Закрыт.
3. `FeedbackDialog.tsx:64-72` — `selectTab` теперь сбрасывает `text`/`category`/файл; тест «does not send remarks typed on another tab with a Word review» проверяет отсутствие `text` и `category` в DOCX_REVIEW. Закрыт.
4. `FeedbackDialog.tsx:102` — `mime: file.type || "application/octet-stream"`; тест «accepts a .md file whose browser MIME type is empty». Закрыт.
5. Оба диалога сбрасывают состояние в `handleOpenChange(false)`; тест «starts from a clean form after the panel is closed and reopened»; `DialogDescription` + ключ `history.description` (ru/en). Закрыт.

### Не требуется

—

## Вопросы владельцу

нет

## Принято как есть / backlog

- Backlog раунда 1 без изменений (палитра/select, дублирование констант, косметика diff, плюрал en, raw fetch вне `request`).
- Слот слияния: после WP-API-FEEDBACK-01 (в очередь добавляется, когда API-пакет принят, чтобы порядок очереди совпал с порядком доставки).
- При rebase после FRONTEND-02/API-FEEDBACK-01 — проверить, что `protocol.toolbar` рендерит обе фичи (feedback, memory) и страница протокола собирается с `useWorkspaceId()`.
- graph: не требуется.

## Автоматические находки

- не найдено

Дифф ревизии (пересдачи): git -C /home/cloudpc/projects/transcriber diff 966f21b6e917fc0d976a706c5d2802e3968fc91f 1b52d6aee9cb1c6baa11cfb57f092802d1f4a4b7

---

## Отчёт рецензента (дословно)

Пересдачу сверял оркестратор сам: чтение диффа ревизии (выше), CI PR #18 на `1b52d6a` и `review_clone.sh` (web test + typecheck) — результаты в строке решения.
