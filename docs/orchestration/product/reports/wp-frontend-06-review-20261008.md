# Сверка — WP-FRONTEND-06 (PR https://github.com/ITSalt/transcriber/pull/31, `e5e9d5fc3f` -> `main @ a50f44d6b6`) — 2026-10-08

Раунд 1. Дифф: 12 files changed, 774 insertions(+), 1 deletion(-) (файлов: 12).

**Решение: `REVISE WP-FRONTEND-06`** — экран реализован и покрыт (слот `meeting.actions` существует на main и рендерится, CI pass, web 262 passed, build 0, мутации M1–M6 красные), но объединение «Тот же, что Speaker K» в корень «оставить как есть» отправляет `{label, name: null}`, и воркер снова выводит «Speaker N» по индексу самой метки — слияние молча не происходит (`mapping.ts:68-70`, `worker/src/lib/transcript-text.ts:19-21`); один пункт + мелкая защита от второго клика.

## Пункты REVISE

1. `web/src/features/speakers/mapping.ts:68-70` → пользователь оставляет Speaker 1 «как есть», для Speaker 3 выбирает «Тот же, что Speaker 1», подтверждает → PUT `mapping: [{label:"SPEAKER_2", name:null}]` → воркер подставляет «Speaker 3» → две метки остаются разными спикерами, выбор молча потерян → требование: для корня «оставить как есть» отправлять объединённой метке `name: <display корня>` (например «Speaker 1») — воркер подставит как есть и метки сольются; тест на этот случай в `speakers.test.tsx`/`mapping` тестах. Серьёзность: Medium (ключевая функция без предупреждения).
2. `web/src/features/speakers/SpeakersConfirmation.tsx:148-150` → после успешного PUT `finally` возвращает `busy=false` до рефетча карточки; повторный клик даёт второй PUT и 409 на исчезающем блоке → требование: при успехе не сбрасывать `busy` (или флаг `done`). Low, одна строка.

### Не требуется

- Токен warning вместо `amber-*` (Low-2), `aria-describedby` для ошибки поля (Low-3), `exact: true` при invalidate (Info-1) — backlog.
- Скриншот в PR не требуется: живую проверку экрана на проде сделает оркестратор в браузере после доставки.

## Вопросы владельцу

нет

## Принято как есть / backlog

- Low-2: сырые цвета Tailwind `amber-*` в StatusBadge (как уже на main); backlog: токен `--color-warning`. Low-3: нет `aria-describedby`. Info-1: лишний GET /speakers после успеха. Info-2: на карточке статус только подписью (паттерн карточки). Info-3: недостижимый TypeError при исчезновении цели merge.
- Отклонения приняты: без скриншота (проверка оркестратором), без `/nacl-sa-ui` (экран по контракту; фиксация в графе — `/nacl-tl-docs` после слияния), без AGENTS.md (D-17), «оставить как есть» = метка не в mapping (по контракту), нативный `<select>`.
- graph: checked — узлы не менялись в этом пакете; UC-505 (BACKEND-07) описывает сценарий; долг документации — после слияния.

## Автоматические находки

- **пути и замки**: WP-FRONTEND-06: web/src/features/speakers/SpeakersConfirmation.tsx is outside the allowed paths
- **пути и замки**: WP-FRONTEND-06: web/src/features/speakers/api.ts is outside the allowed paths
- **пути и замки**: WP-FRONTEND-06: web/src/features/speakers/i18n/en.json is outside the allowed paths
- **пути и замки**: WP-FRONTEND-06: web/src/features/speakers/i18n/ru.json is outside the allowed paths
- **пути и замки**: WP-FRONTEND-06: web/src/features/speakers/index.ts is outside the allowed paths
- **пути и замки**: WP-FRONTEND-06: web/src/features/speakers/mapping.ts is outside the allowed paths
- **пути и замки**: WP-FRONTEND-06: web/src/features/speakers/speakers.test.tsx is outside the allowed paths
- **пути и замки**: WP-FRONTEND-06: web/src/features/speakers/status.test.tsx is outside the allowed paths

Дифф ревизии (пересдачи): —

---

## Отчёт рецензента (дословно)

# Ревью PR #31 — WP-FRONTEND-06 (head `e5e9d5fc3f459c173e0e52b6e8d4cfefd5be5245`, base `main @ a50f44d6b6`)

## 1. Вердикт: **ACCEPT with condition**

Все пять пунктов объёма и критерии приёмки 1–2 реализованы и покрыты RTL-тестами; слот `meeting.actions` существует на main и рендерится страницей встречи; CI на e5e9d5f зелёный; `pnpm --filter @transcrib/web test` (19 файлов / 262), `pnpm -r typecheck` и `pnpm --filter @transcrib/web build` в одноразовом клоне — код 0; все шесть мутаций M1–M6 пойманы тестами PR. Регрессий относительно base нет (дифф аддитивный). Условие: один семантический пробел средней тяжести — «Тот же, что Speaker K», когда корневая метка K оставлена «как есть», отправляет `{label, name: null}`, и воркер снова выводит «Speaker N» по собственному индексу метки — объединение молча не происходит (`web/src/features/speakers/mapping.ts:68-70`, `worker/src/lib/transcript-text.ts:19-21`). Это единственная функциональная находка; остальное — Low/Info. Скриншот (критерий 3) на PR отсутствует.

## 2. Объём → код → статус

| Пункт | Где | Статус |
|---|---|---|
| Объём 1: блок «Подтвердите спикеров» только в `AWAITING_SPEAKERS`; Speaker N, длительность, 3 цитаты; участник / другое имя / тот же, что Speaker K / оставить; кнопки; подсказка о неразделимости | `web/src/features/speakers/SpeakersConfirmation.tsx:27-53` (гейт по статусу из кэша `["meetings", id]`), `:171-253` (метка, длительность `formatDuration`, цитаты `formatMs`, `<select>` с группами), `:265-284` (кнопки), `:160-165` (`splitHint`); реестр `index.ts:6-8` | Сделано |
| Объём 2: после PUT → `GENERATING_PROTOCOL`; 409/404 понятные тексты; статус в каталоге и на карточке, i18n RU/EN | `SpeakersConfirmation.tsx:131-150` (invalidate после 200; 409 → `error.conflict` + invalidate; 404 → `error.notFound`; иное → `error.generic`); `web/src/i18n/{ru,en}.json:38`; `web/src/routes/catalog/components/StatusBadge.tsx:33-39`; карточка — `MetadataCard.tsx:71-75` на main уже читает `catalog.status.*` | Сделано |
| Объём 3: RTL-тесты (рендер, объединение, валидация, тело PUT, 409) | `speakers.test.tsx` (14 тестов), `status.test.tsx` (3) | Сделано |
| Объём 4: не трогать протокол/загрузку/другие фичи | дифф: 12 файлов, только `features/speakers/**`, i18n (+1/+1), `StatusBadge.tsx` (+9/−1), `StatusSection.tsx` (+1 комментарий) | Соблюдено |
| Объём 5: карты статусов — `TRANSIENT_STATUSES` не содержит (не поллим), `StatusBadge` вариант, `TRANSCRIPT_STATUSES` без него | `catalog/index.tsx:16-20` без изменений (не содержит); `StatusBadge.tsx:9-13` без изменений → `outline` + янтарная обводка; `StatusSection.tsx:35-40` без него; мой тест R2: в `AWAITING_SPEAKERS` `btn-view-transcript` отсутствует | Сделано |
| Критерий 1 (виден только в статусе; тела PUT для участника/имени/объединения; skip; 409 + перезапрос) | `speakers.test.tsx:131-240` | Покрыт; подтверждён мутациями M1, M2, M4, M5 |
| Критерий 2 (статус RU/EN в списке и на карточке) | `status.test.tsx:12-18` (StatusBadge RU/EN); карточка — `MetadataCard` через тот же ключ (мой тест R2: «Awaiting speakers» на странице) | Покрыт |
| Критерий 3 (typecheck/test зелёные; скриншот в PR) | typecheck/test/build — код 0 (раздел 6); скриншота на PR нет (`gh pr view 31 --json comments`: единственный комментарий — Codex summary) | Частично: скриншот отсутствует |

## 3. Ответы на вопросы риска

**1. Существование слота.** На main `web/src/lib/features.ts:15-20` объявляет `SLOT_NAMES = ["header.right", "meeting.actions", "protocol.toolbar", "project.tabs"]`, `collectFeatures` (`:55-60`) заводит `"meeting.actions": []`; `web/src/routes/meeting/index.tsx:106-111` рендерит `<SlotOutlet name="meeting.actions" meetingId={meetingId} />` внутри `data-testid="slot-meeting-actions"`. Фича `web/src/features/speakers/index.ts:6-8` экспортирует `slots: { "meeting.actions": SpeakersConfirmation }`, подхватывается `import.meta.glob("../features/*/index.{ts,tsx}")` (`features.ts:77-81`). В том же слоте уже живёт `features/context/index.ts:9-17` (`StartRecognitionAction`, только `AWAITING_START`) — конфликта нет. Тесты PR рендерят `SlotOutlet` с реальным реестром (`speakers.test.tsx:110-117`), т.е. проверяют регистрацию, но не страницу. Мой одноразовый тест R2 (страница `MeetingDetailPage` со статусом `AWAITING_SPEAKERS`) — зелёный: блок внутри `slot-meeting-actions`, кнопка транскрипта скрыта. Орк-замечание о `features.ts` вне diff-stat снято: слот есть на base.

**2. После PUT 200.** Оба канала: компонент сразу делает `invalidateQueries(["meetings", id])` (`SpeakersConfirmation.tsx:137`), плюс SSE-обработчик страницы (`meeting/index.tsx:39-43`) инвалидирует тот же ключ на любой `meeting.status` без фильтра по значению — новые статусы проходят. Блок исчезает после рефетча карточки (мой тест R4 — зелёный). Двойной клик: кнопки `disabled={busy}` (`:267,:276`), `setBusy(true)` до `await` — мой тест R3: `dblClick` + ещё клик → ровно один PUT. Но `finally { setBusy(false) }` (`:149`) срабатывает до завершения рефетча карточки: мой тест R4b показал `confirm button present: true, disabled: false` в этом окне — повторный клик уйдёт вторым PUT и получит 409 с сообщением «уже подтверждены». Не опасно (бэкенд идемпотентен, задание одно), но см. Low-1.

**3. Семантика объединения.** Только метки с меньшим индексом: `index > 0 && data.labels.slice(0, index)` (`:224-232`), тест `only offers merging into earlier labels`, мутация M3 поймана. Корень разрешается в момент отправки (`resolveRoot`, `mapping.ts:36-44`; `buildMapping` `:56-72`), поэтому смена корня после объединения учитывается: мой тест R1/R1b (участник → имя после merge → обе метки получают имя; корень → keep → `{label, name: null}`) зелёный; R1c — merge в корень с пустым именем блокируется с ошибкой у поля корня. Корень «оставить как есть» → объединённая метка шлёт `name: null` (`mapping.ts:68-70`, тест «nulls a merge into a «keep» label»), а не omitted. Это и есть Medium-1: воркер подставляет для `null` «Speaker N» по индексу самой метки, обе метки остаются разными спикерами.

**4. i18n.** `web/src/i18n/config.ts:12-34` регистрирует `features/*/i18n/{ru,en}.json` как namespace `<name>` через `import.meta.glob` — `speakers/i18n/{ru,en}.json` подходят, компонент использует `useTranslation("speakers")`. Паритет ключей RU/EN проверен скриптом: 22 ключа, разница пустая в обе стороны; все 22 `t("…")` компонента существуют. Статус: `catalog.status.AWAITING_SPEAKERS` в `ru.json:38`/`en.json:38`; при отсутствии ключа `StatusBadge` и `MetadataCard` показывают `defaultValue: status` (сырой код статуса). Покрытие: статус RU+EN (`status.test.tsx`); подписи фичи в тестах PR — только EN (`beforeAll changeLanguage("en")`); мой R5 на RU («Подтвердите спикеров», «Оставить как есть», «Другое имя…», «Тот же, что Speaker 1», «Анна — PM», подсказка) — зелёный.

**5. Доступность и дизайн.** `<select aria-label="Кто такой Speaker N">` (`:208`), `<Input aria-label aria-invalid>` (`:238-239`), `<section aria-labelledby="speakers-title">`, `type="button"`, ошибки с `role="alert"`; нет `aria-describedby` от поля к тексту ошибки (Low-3). Время цитат `formatMs` → `mm:ss` («00:45», тест), длительность `m:ss` («1:05»). Используются shadcn `Button`/`Input`; цвета через токены `var(--color-muted-foreground|input|background)` (есть в `globals.css:11,27,35`). Исключения: `border-amber-500 text-amber-700` в `StatusBadge.tsx:38` и `text-red-600` для ошибок — сырая палитра Tailwind, не токены; янтарного/warning-токена в `globals.css` нет; на main та же практика уже есть (`StatusSection.tsx:133 text-amber-600`, `JobErrorBanner.tsx:29`, `ContextForm.tsx:76`). Вариант `Badge` для статуса — `outline` без изменений, т.е. токенный (`badge.tsx:17`); добавлена только обводка (Low-2).

**6. Ошибки.** 409: `setError(t("error.conflict"))` + `invalidateQueries(["meetings", id])` (`:140-143`), тест PR проверяет и сообщение, и повторный GET карточки; M5 поймана. 404 → `error.notFound` (`:144-145`); сетевая ошибка (`TypeError`) и прочие → `error.generic` (`:147`) — мой R6 зелёный для обоих. Тексты всех трёх ошибок и подсказок есть в RU и EN.

**7. Сборка.** `pnpm --filter @transcrib/web build` — код 0 (`tsc --noEmit && vite build`). Дельта к base (собрал a50f44d6b6 в том же клоне): `index-*.js` 1 129,60 → 1 138,24 kB (+8,64 kB; gzip 350,40 → 353,15 kB, +2,75 kB), CSS 39,32 → 39,90 kB; `web/dist` 1 452 452 → 1 462 267 байт (+9 815). `git diff a50f44d6b6 e5e9d5fc -- web/package.json pnpm-lock.yaml` пуст — зависимостей нет. Предупреждение о чанке > 500 kB было и на base.

**8. Что убрано относительно base.** Ничего. `StatusBadge.tsx`: ветка `isTransient ? "animate-pulse"` сохранена, для всех статусов, кроме `AWAITING_SPEAKERS`, `className` по-прежнему `undefined`, `getVariant` и `TRANSIENT_STATUSES` не тронуты. `StatusSection.tsx` — только комментарий. Существующие тесты `routes/meeting/index.test.tsx`, `routes/catalog/index.test.tsx` в прогоне зелёные; мой R2b: в `PROTOCOL_READY`/`TRANSCRIBED` кнопка транскрипта на месте, блока спикеров нет.

**9. Мутации** — таблица в разделе 6; все шесть красные.

## 4. Находки

**Medium-1.** `web/src/features/speakers/mapping.ts:68-70` (+ `SpeakersConfirmation.tsx:224-232`). Сценарий: пользователь не знает имени, но видит, что Speaker 3 — тот же человек, что Speaker 1; оставляет Speaker 1 «как есть», для Speaker 3 выбирает «Тот же, что Speaker 1», подтверждает. PUT: `mapping: [{label:"SPEAKER_2", name:null}]`. Воркер (`worker/src/lib/transcript-text.ts:19-21`): `null` → `speakerLabelToDisplay("SPEAKER_2")` = «Speaker 3». В транскрипте и протоколе остаются два спикера — выбор пользователя молча проигнорирован, UI не предупреждает. Требовать: для корня `keep` отправлять для объединённой метки `name: <display корня>` («Speaker 1») — воркер подставит его как есть, и обе метки сольются; либо не предлагать объединение в корень без имени / показывать подсказку. Плюс тест. Не регрессия (новая функция).

**Low-1.** `SpeakersConfirmation.tsx:148-150`. После успешного PUT `finally` возвращает `busy=false` раньше, чем рефетч карточки скроет блок (мой R4b: кнопка активна в этом окне). Повторный клик → второй PUT → 409 → сообщение «Спикеры уже подтверждены…» на блоке, который через мгновение исчезнет. Требовать: при успехе не сбрасывать `busy` (или отдельный флаг `done`). Не регрессия.

**Low-2.** `web/src/routes/catalog/components/StatusBadge.tsx:38` — `border-amber-500 text-amber-700`: сырые цвета Tailwind вместо токена ITSALT (D-5); токена warning в `globals.css` нет, аналогичная практика уже есть на main (`StatusSection.tsx:133`). Требовать (можно follow-up): ввести `--color-warning*` в `@theme` и использовать его. Не регрессия.

**Low-3.** `SpeakersConfirmation.tsx:235-262` — сообщение об ошибке имени (`role="alert"`) не связано с полем через `aria-describedby`; `aria-invalid` есть. Требовать: `id` на `<p>` и `aria-describedby` на `<Input>`.

**Info-1.** `SpeakersConfirmation.tsx:137` — `invalidateQueries(["meetings", id])` префиксно задевает `["meetings", id, "speakers"]`, который в этот момент ещё `enabled` → лишний `GET /speakers` после успеха (мой R4: 2 вызова). По контракту GET в `GENERATING_PROTOCOL` отвечает 200 — безвредно; можно `exact: true`.

**Info-2.** На карточке встречи статус показывает `MetadataCard.tsx:71-75` вариантом `secondary` для всех не-FAILED статусов — «цвет» из объёма 2 реализован только в списке (`StatusBadge`), на карточке лишь подпись. Приемлемо по текущему паттерну карточки.

**Info-3.** `mapping.ts:63` — если цель merge исчезла из `data.labels` после рефетча (`useEffect` `:88-95` чистит только ключи, не цели), `choices[resolveRoot(...)]!` даст `undefined` и `effective.kind` бросит TypeError. Практически недостижимо (набор меток транскрипта фиксирован).

## 5. Deviations

- Скриншот не в репозитории, `/nacl-tl-qa` как навык не запускался — отклонение от критерия 3 **принято частично**: нет разрешённого пути для артефактов, но обещанный «комментарием/файлом» скриншот на PR на момент ревью отсутствует (`gh pr view 31 --json comments`: только Codex summary от 20:20:39Z). Условие: приложить скриншот к PR или сообщению READY.
- Граф/`/nacl-sa-ui` не использовался, замок `graph` не брался — **принято**: экран спроектирован по контракту и пакету; фиксация в графе — долг для `/nacl-tl-docs` после слияния (оркестратору решить, нужен ли отдельный пункт).
- `AGENTS.md` нет, `orch.py instructions check` не запускался — **принято**, не влияет на код; `CLAUDE.md` не менялся (нет в диффе).
- «Оставить как есть» = метка не попадает в `mapping` — **принято**, соответствует контракту («метки, которых нет в mapping, сохраняют текущее значение») и сохраняет предзаполнение воркера; подтверждено M2.
- Нативный `<select>` вместо Radix — **принято**: доступность обеспечена `aria-label`, визуально оформлен токенами; стилистическое расхождение с `components/ui/select.tsx` можно снять позже.

## 6. CI, размер, тесты, мутации

- CI: `gh pr checks 31` — `Lint + Typecheck + Test` **pass** (2m59s, run 37838708489; workflow гоняет `pnpm run lint`, `pnpm -r run typecheck`, `pnpm -r run test`). Заявленные «86 файлов / 1151» всего монорепо локально не пересчитывал — покрыто CI.
- Размер: 12 файлов, +774/−1; один коммит e5e9d5f; merge-base = `a50f44d6b6` = `origin/main`.
- Клон `review_clone.sh --sha e5e9d5fc… --keep` → `…/scratchpad/clones/orch-review.udbmbQ/repo`, HEAD проверен = e5e9d5fc3f459c173e0e52b6e8d4cfefd5be5245:
  - `pnpm install --frozen-lockfile` → 0; `pnpm --filter @transcrib/api run db:generate` → 0; `pnpm --filter @transcrib/shared build` → 0
  - `pnpm --filter @transcrib/web test` → 0 (19 files / 262 tests passed, 30.5s)
  - `pnpm -r typecheck` → 0
  - `pnpm --filter @transcrib/web build` → 0 (head); то же на `a50f44d6b6` → 0 (для дельты), клон возвращён на head, `git status` чист
  - одноразовый `review.throwaway.test.tsx` (R1, R1b, R1c, R2, R2b, R3, R4, R4b, R5, R6): 10/10 passed; файл удалён до мутаций

| Мутация | Правка | Прогон `speakers.test.tsx` + `status.test.tsx` (17) | Красные тесты |
|---|---|---|---|
| M1 | `awaiting = !!detail` | exit 1, 4 failed | `is hidden in TRANSCRIBING/GENERATING_PROTOCOL/PROTOCOL_READY/TRANSCRIBED and never requests speakers` |
| M2 | keep → `push({label, name:null})` | exit 1, 4 failed | `sends a project participant…`, `sends a free-form name…`, `merges a label…`, `buildMapping > leaves «keep» out…` |
| M3 | merge в любую метку | exit 1, 1 failed | `only offers merging into earlier labels` |
| M4 | `action: "confirm"` всегда | exit 1, 1 failed | `«Skip» sends action skip with no mapping` |
| M5 | убран invalidate при 409 | exit 1, 1 failed | `on 409 shows a message and re-requests the meeting status` |
| M6 | валидация `if (false && …)` | exit 1, 1 failed | `blocks «confirm» with an empty name and shows the error` |

Каждая мутация откачена `git checkout -- <file>`; `git status --short` после серии пуст.

## 7. Очистка

`review_clone.sh --cleanup /tmp/claude-1004/-home-cloudpc-projects-transcriber/4310f49e-95eb-4aeb-8d49-40bf49c26179/scratchpad/clones/orch-review.udbmbQ` → `removed …/orch-review.udbmbQ`, exit 0; в `…/scratchpad/clones/` остался только `node-compile-cache`. В основной checkout, worktrees и рабочее пространство оркестратора ничего не писалось; PR не комментировался.
