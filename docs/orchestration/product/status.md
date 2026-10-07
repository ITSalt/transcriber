# Модернизация Transcrib до продукта — статус

Единственный источник состояния программы `product`. Пишет только оркестратор —
через `orch.py` и точечные правки, после каждого изменения состояния.

## Волны

| Волна | Цель | Гейт | Статус |
|-------|------|------|--------|

## Пакеты работ

Статусы: DRAFT, READY, DISPATCHING, IN_PROGRESS, REVIEW, REVISE, ACCEPTED, MERGED,
TEST-APPLIED / DEPLOYED_TEST, VERIFYING, PROD, DONE, BLOCKED (причина),
CANCELLED (причина).

<!-- orch:wp -->
| WP | Модуль | Название | Статус | Сессия | PR | Обновлено |
|----|--------|----------|--------|--------|----|-----------|

## Ждёт владельца

R-n — действие: точная команда одной строкой и ожидаемый вывод. P-n — вопрос:
варианты с последствиями и рекомендация. Строка закрывается только после сверки
оркестратором по факту; закрытые строки зачёркиваются с датой и фактом.

<!-- orch:owner -->
| ID | Что (команда ; ожидание) | Где описано | Открыто | Закрыто |
|----|--------------------------|-------------|---------|---------|
| P-1 | Repository transcriber: add `.worktreeinclude` in its root (a change of the project, made by a package there) so that every new worktree gets the gitignored files it needs: .env, .env.local (gitignore syntax, one pattern per line; directories as dir/**). Recommend (a) yes: sessions then never copy secrets or settings themselves | orch.py init | 2026-10-07 |  |
| P-2 | Потоки программы: backend = api/**, worker/** ; frontend = web/** ; общие пути (только под блокировкой) = shared/**, api/prisma/**, pnpm-lock.yaml, **/package.json, .tl/**, graph-infra/**, config.yaml, CLAUDE.md. Варианты: (a) так и оставить; (b) резать по доменам (auth/workspaces, reports) сквозь слои. Рекомендую (a): авторизация и отчёты всё равно идут парой BE+FE через контракт в shared/, а доменная нарезка даст пересечения путей в api/src/routes и web/src/routes | orch.yaml | 2026-10-07 |  |
| P-3 | Стенда нет: любой merge в main сразу деплоит прод (deploy-production.yml, base_deploys: prod). Для авторизации и миграции данных в рабочие пространства это рискованно. Варианты: (a) первым пакетом поднять staging (ветка develop -> тестовый стенд), merge пакетов в develop, в прод — пачкой по релизному листу; (b) оставить как есть, merge по одному с проверкой прода после каждого; (c) feature-флаги в проде. Рекомендую (a) | orch.yaml | 2026-10-07 |  |

## Замки

Общие пути и ресурсы репозитория; только держатель правит общий путь, пушит миграцию,
проверяет на стенде, запускает dev-стек на фиксированных портах. Держатель отдаёт замок
после merge или проверки. «Ждут» — пакеты в очереди на замок.

<!-- orch:locks -->
| Замок | Репозиторий | Держатель | С | Ждут | Примечание |
|-------|-------------|-----------|---|------|------------|

## Очередь слияний

При `merge_policy: sequential`: по одному; после каждого merge — зелёный деплой
стенда и health-check, затем rebase следующего пакета.

<!-- orch:merge -->
| # | Репозиторий | WP | PR | Rebase после | Статус |
|---|-------------|----|----|--------------|--------|

## Журнал

Новые сверху. Одна строка на событие: время (UTC), WP, что произошло, чем подтверждено.

<!-- orch:journal -->
| Дата | WP | Событие | Подтверждение |
|------|----|---------|---------------|
| 2026-10-07 15:45Z | — | P-3 opened for owner | orch.yaml |
| 2026-10-07 15:44Z | — | P-2 opened for owner | orch.yaml |
| 2026-10-07 15:44Z | — | P-1 opened for owner | orch.py init |
| 2026-10-07 15:44Z | — | permission mode: bypassPermissions, confirmed by the owner | orch.py init |
| 2026-10-07 15:44Z | — | session kind: local, confirmed by the owner | orch.py init |
| 2026-10-07 15:44Z | — | workspace created (ru) | orch.py init |
