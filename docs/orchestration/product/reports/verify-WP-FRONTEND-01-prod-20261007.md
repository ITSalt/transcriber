# Проверка — WP-FRONTEND-01 на prod (`e31feb393fa4`) — 2026-10-07

**Вердикт: PASS** — пройдено проверок: 3

Ветка `main`, базовый URL https://transcriber.itsalt.ru, статус пакета на старте: VERIFIED_TEST.

## Run деплоя, отдаваемая версия и команды проверки

| # | Проверка | Команда или цель | Код | Вывод (первые строки) | Вердикт |
|---|----------|------------------|-----|-----------------------|---------|
| 1 | run деплоя | `deploy-production.yml` | — | deploy-production.yml: success https://github.com/ITSalt/transcriber/actions/runs/37660361129 | PASS |
| 2 | команда проверки | `curl -fsS https://transcriber.itsalt.ru/api/health` | 0 | {"status":"ok","version":"unknown","ts":"2026-10-07T17:39:19.446Z"} | PASS |
| 3 | команда проверки | `curl -fsS -o /dev/null -w '%{http_code}' https://transcriber.itsalt.ru/api/meetings` | 0 | 200 | PASS |

## Живой сценарий

Проверено read-only через curl на https://transcriber.itsalt.ru после деплоя `e31feb393f` (2026-10-07 ~17:45Z):

| Критерий | Шаги | Ожидалось | Получено |
|----------|------|-----------|----------|
| AC-2 токены ITSALT в проде (не стоковые shadcn) | `GET /` → имя CSS-бандла `assets/index-Blhzfsef.css` → `GET` CSS, grep токенов | `--radius-md:14px`, primary `#c84312`, brand `#f4510b`, `--font-display: "Inter Tight"` | все четыре найдены в отдаваемом CSS |
| 2.2 шрифты self-host | `HEAD /fonts/inter-tight-latin-800.woff2` | 200, `font/woff2` | `200 font/woff2`; в CSS есть `@font-face` с `inter-tight-latin-800` |
| 2.4/5a каркас и слоты в бандле | `GET` JS-бандла, grep `slot-header-right` | есть | 1 вхождение |
| verify_prod | `curl /api/health`, `/api/meetings` → 200 | 200 | PASS (3 проверки orch.py verify) |

Браузерный прогон (e2e: none) не выполнялся; визуальная проверка — по скриншотам PR (artifact v2, 16 PNG) в отчёте ревью r2. Сбоев инструментов не было.
