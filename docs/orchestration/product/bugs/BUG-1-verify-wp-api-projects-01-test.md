# BUG-1 — WP-API-PROJECTS-01: проверка на test не пройдена

| Поле | Значение |
|------|----------|
| Найден | 2026-10-08, orch.py verify --env test (отчёт reports/verify-WP-API-PROJECTS-01-test-20261008.md) |
| Окружение | TEST, `bf75f694f2` |
| Модуль | api-projects |
| Серьёзность | high |
| Статус | открыт (WP-API-PROJECTS-01) |

## Симптом

Проваленные проверки:

- команда проверки: `curl -fsS -o /dev/null -w '%{http_code}' https://transcriber.itsalt.ru/api/meetings` -> 22: 401curl: (22) The requested URL returned error: 401

## Воспроизведение

1. Запусти `orch.py verify WP-API-PROJECTS-01 --env test --sha bf75f694f2`.

## Ожидалось и получено

Все проверки проходят для `bf75f694f2`.

## Подтверждение

[reports/verify-WP-API-PROJECTS-01-test-20261008.md](../reports/verify-WP-API-PROJECTS-01-test-20261008.md)

## Причина

Пока не установлена.
