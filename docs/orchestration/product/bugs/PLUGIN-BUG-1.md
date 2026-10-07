# PLUGIN-BUG-1 — Стартовый промпт требует instructions sync CLAUDE.md/AGENTS.md вопреки концепции

| Поле | Значение |
|------|----------|
| Найден | 2026-10-07, QUESTION трёх сессий модулей после dispatch |
| Окружение | pepper-orchestrator 0.11.0, Claude Code 2.1.292, Ubuntu 24.04, Python 3.12 |
| Модуль | плагин: orch.py dispatch (project_instructions.GUIDANCE) |
| Серьёзность | medium |
| Статус | открыт; Issue: см. ниже |

## Симптом
Хвост стартового промпта велит сессии создать/обновить общий блок в CLAUDE.md и AGENTS.md через `orch.py instructions sync`. Концепция §2: оркестратор никогда не просит сессию менять CLAUDE.md; CLAUDE.md — общий путь репозитория, пакетом не объявленный.

## Воспроизведение
1. `orch.py dispatch <WP> --dry-run` в репозитории с CLAUDE.md и без AGENTS.md.
2. Сессия выполняет промпт → `instructions status` даёт synchronized=false → QUESTION.

## Ожидалось и получено
Ожидалось: только чтение инструкций, sync опционален и уважает shared_paths. Получено: три QUESTION подряд, `instructions check` exit 1 без текста.

## Подтверждение
Журнал status.md 2026-10-07 (QUESTION WP-BACKEND-06, WP-INFRA-01, WP-FRONTEND-01); D-17.

## Причина
Фиксированный блок GUIDANCE добавляется к каждому стартовому промпту (orch.py, mapping START_PROMPT) без учёта shared_paths и правил концепции.

## Issue
https://github.com/ITSalt/PepperSkills/issues/32
