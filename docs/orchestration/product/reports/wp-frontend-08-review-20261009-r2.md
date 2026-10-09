# Сверка — WP-FRONTEND-08 (PR https://github.com/ITSalt/transcriber/pull/41, `6e4b93ff90` -> `main @ f68514de34`) — 2026-10-09

Раунд 2. Дифф: 10 files changed, 278 insertions(+), 30 deletions(-) (файлов: 10).

**Решение: `ACCEPTED WP-FRONTEND-08`** — все три пункта раунда 1 закрыты по диффу ревизии 81fba93636 → 6e4b93ff90 (4 файла, +78/−3): `catalog/index.tsx` — `staleProject` (id из `?project=` отсутствует среди загруженных проектов) → фильтр не уходит в запрос и удаляется из URL через `setSearchParams(…, {replace: true})`; тесты «round-trips ?project=» (запрос и select по URL, сброс убирает оба) и «drops a ?project= not in this workspace»; фикстуры `routes/meeting/index.test.tsx` и `RetryProcessingButton.test.tsx` с `project_id: null, project_name: null`. CI на 6e4b93ff90 — ждёт цепочка доставки (при красном — возврат в REVISE).

graph: checked — FORM-MeetingCatalog F01/F07/F08, FORM-MeetingDetail F12 (запрос к графу после UNLOCK, раунд 1).

## Пункты REVISE

<нумерованные: `file:line` -> сценарий отказа -> требование; серьёзность>

### Не требуется

<чего сессия не должна добавлять или менять в этом раунде>

## Вопросы владельцу

<P-n, возникшие в сверке: вопрос, варианты, рекомендация; условные пункты REVISE называют P-n,
от которого зависят>

## Принято как есть / backlog

<находки low и info, принятые отклонения, кандидаты в backlog>

## Автоматические находки

- не найдено

Дифф ревизии (пересдачи): git -C /home/cloudpc/projects/transcriber diff 81fba936363dd7d0cadbc41aa1e2fb8f8e99438c 6e4b93ff90ae42c6b7fad42805ae26b332c4cf96

---

## Отчёт рецензента (дословно)

Пересдачу сверил оркестратор по диффу ревизии и CI (рецензент-агент не запускался): правка `catalog/index.tsx` (16 строк) и три тестовых файла.
