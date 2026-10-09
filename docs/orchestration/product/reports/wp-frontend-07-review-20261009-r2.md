# Сверка — WP-FRONTEND-07 (PR https://github.com/ITSalt/transcriber/pull/35, `9cf5dc0df1` -> `main @ 7811d25cc2`) — 2026-10-09

Раунд 2. Дифф: 15 files changed, 167 insertions(+), 74 deletions(-) (файлов: 15).

**Решение: `ACCEPTED WP-FRONTEND-07`** — все три пункта раунда 1 закрыты по диффу ревизии f367c1b14f → 9cf5dc0df1 (4 файла, +56/−4): `mapping.ts` — при объединении в «оставить» корень отправляется с тем же именем, что и присоединённая метка (один раз), тест «sends the root's name for both root and merged label»; `speakers.test.tsx` — RU-рендер («Спикер 1», «Спикер 2», «Тот же, что Спикер 1») и RU-тело объединения `{SPEAKER_0: "Спикер 1"}, {SPEAKER_1: "Спикер 1"}`; `SpeakerLabel.tsx` — индекс +1 с новым `SpeakerLabel.test.tsx`. Файл вне путей (`routes/upload/index.test.tsx`, 2 строки) — принято в раунде 1. CI на 9cf5dc0df1 — ждёт цепочка доставки (при красном — возврат в REVISE). Слияние после WP-WORKER-08 (очередь; `intro` экрана обещает «Спикер N» в протоколе, это даёт воркер).

graph: checked — пакет граф не трогает (подписи форм перевёл WP-SPEC-01).

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

- **пути и замки**: WP-FRONTEND-07: web/src/routes/upload/index.test.tsx is outside the allowed paths
- **merge-base**: WP-FRONTEND-07: branch point 5392bbe5e1 is 1 commits behind origin/main (no overlapping files) - rebase before merge

Дифф ревизии (пересдачи): git -C /home/cloudpc/projects/transcriber diff f367c1b14fede0a30e19aeed936446fd3bf6b93f 9cf5dc0df176cf4f40f5d2901a9ec973d0d4d6ee

---

## Отчёт рецензента (дословно)

Пересдачу сверил оркестратор по диффу ревизии и CI (рецензент-агент не запускался): `mapping.ts:+5` корень с тем же именем, `SpeakerLabel.tsx` n+1, тесты RU и объединения.
