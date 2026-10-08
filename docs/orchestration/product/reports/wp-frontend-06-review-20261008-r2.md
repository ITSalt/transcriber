# Сверка — WP-FRONTEND-06 (PR https://github.com/ITSalt/transcriber/pull/31, `53b3ca8906` -> `main @ a50f44d6b6`) — 2026-10-08

Раунд 2. Дифф: 12 files changed, 810 insertions(+), 1 deletion(-) (файлов: 12).

**Решение: `ACCEPTED WP-FRONTEND-06`** — пересдача 1 (53b3ca8) закрывает оба пункта: `buildMapping` получает display меток и для слияния в корень «как есть» отправляет `name` = «Speaker N» корня (воркер подставит как есть → метки сольются), после успешного PUT `busy` не сбрасывается; +3 теста (тело PUT, `buildMapping`, второй клик не шлёт запрос); дифф ревизии — только три файла фичи (+51/−15); CI на 53b3ca8 — ждём pass (G3); живая проверка экрана — в браузере на проде после доставки.

## Пункты REVISE

нет

### Не требуется

—

## Вопросы владельцу

нет

## Принято как есть / backlog

- Как в раунде 1: токен warning вместо `amber-*`, `aria-describedby`, `exact: true` при invalidate, статус на карточке только подписью. Косметика: две инструкции `useState` в одной строке (`SpeakersConfirmation.tsx`).
- graph: checked — узлы не менялись; долг `/nacl-tl-docs` по экрану UC-505 после слияния.

## Автоматические находки

- **пути и замки**: WP-FRONTEND-06: web/src/features/speakers/SpeakersConfirmation.tsx is outside the allowed paths
- **пути и замки**: WP-FRONTEND-06: web/src/features/speakers/api.ts is outside the allowed paths
- **пути и замки**: WP-FRONTEND-06: web/src/features/speakers/i18n/en.json is outside the allowed paths
- **пути и замки**: WP-FRONTEND-06: web/src/features/speakers/i18n/ru.json is outside the allowed paths
- **пути и замки**: WP-FRONTEND-06: web/src/features/speakers/index.ts is outside the allowed paths
- **пути и замки**: WP-FRONTEND-06: web/src/features/speakers/mapping.ts is outside the allowed paths
- **пути и замки**: WP-FRONTEND-06: web/src/features/speakers/speakers.test.tsx is outside the allowed paths
- **пути и замки**: WP-FRONTEND-06: web/src/features/speakers/status.test.tsx is outside the allowed paths

Дифф ревизии (пересдачи): git -C /home/cloudpc/projects/transcriber diff e5e9d5fc3f459c173e0e52b6e8d4cfefd5be5245 53b3ca8906da0fa402e6d185055012889ed1a2df

---

## Отчёт рецензента (дословно)

Пересдачу сверил оркестратор: `git diff e5e9d5fc3f 53b3ca8906` — `mapping.ts` (параметр `displays`, `name: displays[rootLabel] ?? null`), `SpeakersConfirmation.tsx` (передача display, `busy` не сбрасывается при успехе), `speakers.test.tsx` (+3 теста). Тело PR, «Пересдача 1»: typecheck ✔, speakers 19 ✔. Отчёт рецензента раунда 1: `reports/wp-frontend-06-review-20261008.md`.
