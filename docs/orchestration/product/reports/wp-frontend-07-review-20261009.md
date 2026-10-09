# Сверка — WP-FRONTEND-07 (PR https://github.com/ITSalt/transcriber/pull/35, `f367c1b14f` -> `main @ 5392bbe5e1`) — 2026-10-09

Раунд 1. Дифф: 13 files changed, 111 insertions(+), 70 deletions(-) (файлов: 13).

**Решение: `REVISE WP-FRONTEND-07`** — все шесть пунктов объёма сделаны и заявления PR подтверждены (CI зелёный, typecheck в клоне зелёный), но объединение меток регрессирует относительно base: в RU корневая метка остаётся `null` в `speaker_map`, а присоединённая получает «Спикер K» — в промпте это два разных спикера; критерий 4 пакета не выполним этим кодом.

## Пункты REVISE

1. `web/src/features/speakers/SpeakersConfirmation.tsx:139-143`, `web/src/features/speakers/mapping.ts:78-82` → RU: SPEAKER_0 «оставить», SPEAKER_1 «Тот же, что Спикер 1» → PUT `mapping: [{label:"SPEAKER_1", name:"Спикер 1"}]` → `speaker_map = {SPEAKER_0: null, SPEAKER_1: "Спикер 1"}` → воркер рендерит `Speaker 1:` и `Спикер 1:` как двух людей (на base оба были `Speaker 1` через `display`, и сливались; EN сейчас совпадает случайно и сломается после WP-WORKER-08) → критерий 4 («Спикер K» для объединённого корня в `speaker_mapping`). Требование: при объединении в «оставить» слать и корень `{ label: rootLabel, name }` с тем же именем (контракт допускает: `speakers-confirmation.md:71-72`, корень один раз); обновить `speakers.test.tsx:224-233, 265-276`. Серьёзность: High.
2. `web/src/features/speakers/speakers.test.tsx:125-127` → весь набор на `changeLanguage("en")`, ни одного утверждения с «Спикер»; `wording.test.ts` проверяет только JSON → объём п. 4 и критерий 3 про RU. Требование: RU-рендер (`speaker-SPEAKER_0` = «Спикер 1», `option.sameAs` = «Тот же, что Спикер 1») и тело RU-объединения. Серьёзность: Medium.
3. `web/src/routes/transcript/components/SpeakerLabel.tsx:18-20` → `n = speakerId.replace(/\D/g,"")` даёт «Спикер 0» для `SPEAKER_0`, а экран подтверждения и протокол называют его «Спикер 1» → D-41 (единообразно, от транскрипта). Существовало до PR, путь разрешён, одна строка (`+1`). Требование: индекс +1 и тест. Серьёзность: Low, входит в раунд.

### Не требуется

- `shared/src/api/workspace.ts:34` (комментарий A-2) — вне области, перейдёт в WP-BACKEND-08.
- Убирать строку «Название» из таблицы сведений (дубль с H1) — косметика, не требуется.
- Менять `display` в API (`api/src/features/speakers/service.ts:105`) — не в области.

## Вопросы владельцу

нет

## Принято как есть / backlog

- Deviations 1–6 приняты (AWAITING_START «Ожидает запуска»; 2 строки в `routes/upload/index.test.tsx` — минимальное следствие п. 3; EN-формулировки; typecheck в клоне с собранным shared — exit 0; AGENTS.md — D-17).
- Порядок доставки: `intro` экрана обещает «Спикер N» в протоколе — это даёт WP-WORKER-08; слияние FRONTEND-07 после WORKER-08 (очередь слияний).
- Backlog: дубль названия встречи (H1 + строка «Название»).

## Автоматические находки

- **пути и замки**: WP-FRONTEND-07: web/src/routes/upload/index.test.tsx is outside the allowed paths

Дифф ревизии (пересдачи): —

---

## Отчёт рецензента (дословно)

Verdict: REVISE. All six scope items implemented and every PR-body claim checks out (wording, removed keys `meeting.status.*`/`upload.title` with no remaining usages, 11/11 statuses incl. AWAITING_START, upload strings verbatim, «Спикер N» derived from `SPEAKER_n` with `display` rendered nowhere, H1 = title ?? filename with date, tests). One functional regression blocks: merge into a kept label sends the localized name for the member only (`SpeakersConfirmation.tsx:139-143` → `mapping.ts:81`), root skipped (`mapping.ts:71`); on base both resolved to API `display` `Speaker K` and merged; on head in RU `speaker_map = {SPEAKER_0: null, SPEAKER_1: "Спикер 1"}` → worker `transcript-text.ts:19-21,34` renders two speakers. EN works only by byte-equality with the worker string and breaks after WP-WORKER-08.

Allowed paths: 12/13 inside; `routes/upload/index.test.tsx` 2 lines (expected `upload.fieldFile` text) — minimal consequence, accept. Transcript vs confirmation disagree: `SpeakerLabel.tsx:18` → «Спикер 0» for SPEAKER_0 vs «Спикер 1» on confirmation (pre-existing, allowed path). Meeting card: header inserted at `routes/meeting/index.tsx:82-92`, rest identical to base; title now also in «Название» row. Findings: H1 (High) merge split; M1 (Medium) no RU assertions in speakers tests (suite on `changeLanguage("en")`); L1 (Low) «Спикер 0»; I1 intro promise depends on WP-WORKER-08; I2 `shared/src/api/workspace.ts:34` A-2 comment outside paths.

CI pass (run 37919323319, 2m51s); 13 files +111/−70; clone `orch-review.AEk3IW`: setup exit 0, `pnpm -r typecheck` exit 0; full web run 5 timeouts under load (different set on rerun), package files alone: catalog 14/14, meeting 40/40, speakers 16/16, wording 4/4, features 3/3, App 2/2, upload 18/18; `context.test.tsx` alone 12/12 twice. Mutations: nav.catalog → «Задачи» killed (wording + features tests); delete `catalog.status.EDITED` killed; merge name back to `l.display` killed; `<h1>` → `<p>` killed. Cleanup: clone removed, nothing written to repo or PR.
