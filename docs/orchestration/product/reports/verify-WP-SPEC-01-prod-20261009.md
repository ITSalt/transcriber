# Проверка — WP-SPEC-01 на prod (`7811d25cc230`) — 2026-10-09

**Вердикт: PASS** — пройдено проверок: 3

Ветка `main`, базовый URL https://transcriber.itsalt.ru, статус пакета на старте: VERIFIED_TEST.

## Run деплоя, отдаваемая версия и команды проверки

| # | Проверка | Команда или цель | Код | Вывод (первые строки) | Вердикт |
|---|----------|------------------|-----|-----------------------|---------|
| 1 | run деплоя | `deploy-production.yml` | — | deploy-production.yml: success https://github.com/ITSalt/transcriber/actions/runs/37919965780 | PASS |
| 2 | команда проверки | `curl -fsS https://transcriber.itsalt.ru/api/health` | 0 | {"status":"ok","version":"unknown","ts":"2026-10-09T10:54:09.887Z"} | PASS |
| 3 | команда проверки | `test "$(curl -s -o /dev/null -w '%{http_code}' https://transcriber.itsalt.ru/api/meetings)" = 401 && echo 'meetings without session -> 401 (AUTH_REQUIRED=true, R-16)'` | 0 | meetings without session -> 401 (AUTH_REQUIRED=true, R-16) | PASS |

## Живой сценарий

Критерии 1–3 (граф): проверены read-only запросами к `codex-transcriber-knowledge-neo4j` 2026-10-09 после пересдачи (см. `reports/wp-spec-01-review-20261009-r2.md`): 48 терминов, 48 approved, 0 с «?»/«???», `size(aliases[0])` GLO-001 = 7, `MATCH (u:UseCase) WHERE toLower(u.user_story) CONTAINS 'задач'` → 0, `FORM-MeetingCatalog.name` = «Встречи». Граф спецификации живёт локально и в экспорте репозитория, на прод не деплоится.
Критерий 4: `/nacl-ba-validate` и `/nacl-sa-validate` — 0 CRITICAL по глоссарию/Form/UC (тело PR #32).
Критерий 5: на VM `/opt/transcrib` HEAD = 7811d25cc2, `grep -c OpenRouter CLAUDE.md` = 1, `transcrib-api`/`transcrib-worker` online после деплоя (ssh 2026-10-09 10:54Z); CI PR #32 зелёный.
