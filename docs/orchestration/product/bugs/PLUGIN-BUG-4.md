# PLUGIN-BUG-4 — Два параллельных `review_clone.sh` получили один рабочий каталог `/tmp/orch-review.XXXXXX`

| Поле | Значение |
|------|----------|
| Найден | 2026-10-08, параллельная сверка PR #20 (WP-API-PROJECTS-01) и PR #21 (WP-API-FEEDBACK-01) двумя агентами `orchestrator-reviewer` |
| Окружение | pepper-orchestrator 0.11.0, Claude Code 2.1.292 (песочница Bash), Ubuntu 24.04, bash, `/tmp` общий |
| Модуль | плагин: scripts/review_clone.sh (mktemp + clone + checkout --detach) |
| Серьёзность | medium (результаты тестов одной сверки могли быть засчитаны другой) |
| Статус | открыт, обход найден |
| Issue | https://github.com/ITSalt/PepperSkills/issues/35 |

## Симптом
Первый агент: `review_clone.sh --sha 1c05fcb… --keep` → `clone: … at 1c05fcbbdc`, `kept: /tmp/orch-review.LQk4dw/repo`.
Второй агент (другой PR, параллельно, минутой позже): `review_clone.sh --sha a7798d4… --keep` → тоже `clone: … at 1c05fcbbdc`, `kept: /tmp/orch-review.LQk4dw/repo` — тот же каталог и чужой SHA, хотя запрошен `a7798d4`. Второй агент сделал `git checkout a7798d4` внутри каталога, первый агент увидел, что HEAD его клона переключён и в нём идёт чужой vitest; оба первых прогона тестов отброшены.

## Воспроизведение
1. Запустить два `review_clone.sh --repo <url> --sha <A> --keep` и `--sha <B> --keep` одновременно из двух подагентов в одной сессии Claude Code (песочница Bash).
2. Сравнить строки `kept:` и `clone: … at` в выводе.

## Ожидалось и получено
Ожидалось: `mktemp -d /tmp/orch-review.XXXXXX` даёт уникальный каталог на каждый запуск; checkout строго на `--sha`.
Получено: один каталог на два запуска; второй запуск отчитался SHA первого. Из транскриптов: в транскрипте второго агента строка `clone: … at 1c05fcbbdc` встречается дважды при трёх вызовах с `--sha a7798d4…`.

## Подтверждение
reports/wp-api-projects-01-review-20261008.md и reports/wp-api-feedback-01-review-20261008.md (разделы «Клон и прогоны»); транскрипты подагентов сверки (локально).

## Причина
Не установлена. Гипотезы: (1) песочница Claude Code отдаёт подагентам общий `/tmp`, а `mktemp` внутри неё не атомарен/детерминирован; (2) скрипт при существующем каталоге клона (ошибка `git clone` в непустой каталог, stderr в `clone.log`) не прерывается и печатает HEAD уже существующего клона. Проверить по `clone.log`/коду строк 36–51.

## Обход
Клон в каталоге сессии: `TMPDIR=<scratchpad>/clones review_clone.sh …` (второй агент так и сделал) или не запускать две сверки с `--keep` одновременно. Предложение: в `review_clone.sh` после `mktemp` проверять, что каталог пуст, прерываться при ошибке `git clone`, и после checkout сверять `rev-parse HEAD` с `--sha` (exit 2 при расхождении).
