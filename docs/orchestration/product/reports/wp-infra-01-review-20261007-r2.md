# Сверка — WP-INFRA-01 (PR https://github.com/ITSalt/transcriber/pull/10, `1f33af81e2` -> `main @ 343f4a108a`) — 2026-10-07

Раунд 2. Дифф: 7 files changed, 258 insertions(+) (файлов: 7).

**Решение: `ACCEPTED WP-INFRA-01`** — пересдача 1 закрыла все четыре пункта (5 файлов, +57/−8), разбор `.env` больше ничего не выполняет, скрипты проверены вживую на новой ревизии (в том числе остановленный контейнер и защита по label), CI зелёный.

## Пункты REVISE

нет

### Не требуется

—

## Вопросы владельцу

- P-13 открыт: реализован рекомендованный вариант (b) — `graph:migrate` нефатален, `::error::` в логе деплоя. Иной ответ владельца станет пунктом следующего пакета infra (одна строка в `deploy-production.yml`).
- R-7 открыт: README и `.env.example` описывают `/opt/transcrib/.env` (compose, шаг деплоя) и `/opt/transcrib/worker/.env` (воркер, `graph:migrate`) по `ecosystem.config.cjs`; если факт на VM иной, правка README — следующим пакетом или при доставке как пункт владельцу.

## Принято как есть / backlog

- Как в раунде 1: F-7 (`--memory` на одноразовом контейнере), F-8 (`profiles:`), F-9 (CI +33 с) — backlog/информация владельцу.
- Дополнение сессии вне списка: замер `/data` через `docker run --rm --volumes-from … --entrypoint du` вместо `docker exec` — обосновано (`ps -aq` пропускает остановленный контейнер, `exec` на нём падает), проверено вживую (сценарий B).
- Защита по label добавлена и в backup (не только в restore) — принято.
- graph: checked — ADR-013 «Project memory: separate Neo4j on prod; Postgres stays the system of record» (Requirement, approved) записан в граф сессией WP-BACKEND-06 под замком `graph` (A-4); read-cypher 2026-10-07 ~17:40Z, вместе с DEC-009, FR-006, TECH-027. Пакет INFRA-01 соответствует ADR-013 (отдельный экземпляр, лимиты D-16, бэкап).

## Автоматические находки

- не найдено

Дифф ревизии (пересдачи): git -C /home/cloudpc/projects/transcriber diff 278863f54ef5fc42e53afa49ff84d6aed4e76e78 1f33af81e2e93adec05c0c41e62e81e8579ad884

---

## Отчёт рецензента (дословно)

Пересдачу сверил оркестратор (без агента-рецензента).

Дифф ревизии `278863f..1f33af8`: 5 файлов, +57/−8.
- Пункт 1, `.github/workflows/deploy-production.yml:62-77`: `.env` читается построчно, `case` по четырём ключам `MEMORY_NEO4J_*`, `\r` срезан, одна пара внешних кавычек снята, `export "$key=$val"`; `eval` удалён. Сухой прогон оркестратора (точный блок из ревизии под `set -euo pipefail`): `MEMORY_NEO4J_PASSWORD=pa ss$word`+backticks+`$(id)` → прочитан как текст байт-в-байт, ничего не выполнено; CRLF-строка URI в кавычках → `bolt://127.0.0.1:7688`; ключ без `=` и посторонний `OTHER=$(touch …)` проигнорированы (файл не создан); exit 0.
- Пункт 2, `scripts/README-neo4j.md:25-45`, `.env.example:40-48`: пароль в `/opt/transcrib/.env` до первого `docker compose up -d memory-neo4j`; таблица «кто какой `.env` читает» (compose и шаг деплоя — `/opt/transcrib/.env`; воркер и `graph:migrate` — `/opt/transcrib/worker/.env`); поведение деплоя при пропуске и при падении миграции.
- Пункт 3 (условно по P-13), `deploy-production.yml:81-82`: `pnpm … graph:migrate || echo "::error::graph:migrate failed - run it manually"`.
- Пункт 4, `scripts/neo4j-backup.sh:17-22,30,43`, `scripts/neo4j-restore.sh:12-16`: `docker compose ps -aq`; проверка label `com.docker.compose.service` = `memory-neo4j` перед любым действием (в обоих скриптах); `rm -f "$OUT.partial"` в `cleanup`; замер `/data` через `docker run --entrypoint du`.
- Ничего другого не изменено.

CI: run 37659393076 `Lint + Typecheck + Test` pass (1m45s); PR mergeable.

Живая проверка оркестратора на `1f33af8` (одноразовый клон, docker, `COMPOSE_PROJECT_NAME=orchinfra`):
- A. бэкап на работающем контейнере: `Dump completed successfully`, `neo4j-20261007T173055Z.dump.gz`, контейнер снова healthy;
- B. бэкап на остановленном контейнере (`docker stop` заранее, state `exited`): найден через `ps -aq`, `/data` измерен через `docker run`, дамп успешен, после скрипта контейнер `running` и healthy;
- C. `NEO4J_CONTAINER=<чужой Neo4j-контейнер на этом демоне>` для restore: `ERROR: … is not the memory-neo4j compose service (label: 'neo4j')`, чужой контейнер остался `running`; C2. то же для backup — отказ;
- D. узел `OrchCheck2` удалён (count 0) → `neo4j-restore.sh <последний дамп>` → `Restore complete`, count 1;
- ротация: 2 копии; `docker compose down -v` — чисто.

Автоматические находки review-start: нет (7 файлов, все в путях потока infra).

**Ревизия `0e7ebe85d3` (после merge WP-FRONTEND-01 в main):** merge-коммит с родителями `1f33af81e2` (принятая ревизия) и `e31feb393f` (main), без force-push. `git diff 1f33af8 0e7ebe8 -- docker-compose.yml .env.example .github scripts` пуст; `git diff e31feb3...0e7ebe8`: те же 7 файлов, +258/−0. Содержимое пакета не изменилось; принимается без нового раунда.
