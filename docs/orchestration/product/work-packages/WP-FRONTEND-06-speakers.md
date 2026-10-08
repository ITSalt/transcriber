# WP-FRONTEND-06 — Экран подтверждения спикеров перед генерацией протокола

| Поле | Значение |
|------|----------|
| Поток | frontend (area) |
| Репозиторий | /home/cloudpc/projects/transcriber |
| Базовая ветка | main |
| Линия | main |
| Рабочая ветка | `feature/wp-frontend-06-speakers` |
| Worktree | `.claude/worktrees/wp-frontend-06-speakers` (создаёт `claude -w wp-frontend-06-speakers`) |
| Заголовок PR | `[PRODUCT] WP-FRONTEND-06: Экран подтверждения спикеров перед генерацией протокола` |
| Сессия | `product-frontend` |
| Модель | `sonnet` |
| Усилие | — |
| Почему такая модель | модель реализатора по умолчанию (orch.yaml models.implement) |
| Режим | nacl: `/nacl-sa-ui` (экран/состояние карточки встречи) под замком `graph`, `/nacl-tl-dev-fe` по TDD, `/nacl-tl-qa` локально |
| Команды методологии: разрешены | nacl: `nacl-tl-dev-fe`, `nacl-tl-fix`, `nacl-tl-review`, `nacl-tl-regression-test`, `nacl-tl-verify-code`, `nacl-tl-sync`, `nacl-tl-docs`, `nacl-tl-stubs`, `nacl-tl-qa`, `nacl-sa-ui`, `nacl-tl-status` |
| Команды методологии: запрещены | `nacl-tl-release`, `nacl-tl-deploy`, `nacl-tl-deliver`, `nacl-tl-hotfix`, `nacl-tl-ship`, `nacl-tl-conductor`, `nacl-tl-full`, `nacl-goal`, `nacl-publish` |
| Разрешённые пути | `web/{index.html,vite.config.ts,tsconfig.json,tsconfig.node.json,vitest.config.ts,README.md}`, `web/public/**`, `web/src/{main.tsx,App.test.tsx,test-setup.ts,vite-env.d.ts}`, `web/src/styles/**`, `web/src/components/**`, `web/src/lib/**`, `web/src/i18n/**`, `web/src/routes/{catalog,meeting,transcript}/**`, `web/src/features/{shell,auth,tasks}/**` |
| Общие пути, которые трогает пакет | `web/src/i18n/**` (подписи статуса и экрана, RU/EN) |
| Миграции | нет |
| Ресурсы (замки) | `graph` по запросу |
| Тестовая БД и порты | нет; нет |
| Слот слияния | после пакета воркера с гейтом AWAITING_SPEAKERS (очередь слияний последовательная); разработка — параллельно |
| Контракт | потребляет speakers v1 (`shared/src/api/speakers.ts`, `.tl/external-contracts/speakers-confirmation.md`) |
| Зависит от | WP-BACKEND-07 (в main, 2e131fe287) |
| Размер | M |
| Спецификация | UC-002 (карточка встречи), UC-200; дизайн-система ITSALT (D-5) |
| Граф | экран подтверждения спикеров через `/nacl-sa-ui` |
| Решения | D-38, D-5, D-15 (фичи через реестр) |

Общие пути этого репозитория (объяви те, что трогает пакет): `pnpm-lock.yaml`, `package.json`, `**/package.json`, `shared/**`, `api/prisma/**`, `.tl/{status.json,master-plan.md,changelog.md,release-status.json,deploy-plan.md}`, `.tl/external-contracts/**`, `graph-infra/**`, `config.yaml`, `CLAUDE.md`, `api/src/server.ts`, `worker/src/index.ts`, `worker/src/job-processor.ts`, `worker/src/queues.ts`, `web/src/App.tsx`, `web/src/i18n/**`.
Ресурсы этого репозитория, требующие замка: `migrations`, `graph` (по запросу: LOCK/UNLOCK, см. раздел 6), `dev-stack` (по запросу: LOCK/UNLOCK, см. раздел 6).

## 0. Подготовка worktree

1. Переключи worktree на ветку пакета: `git fetch origin && git switch -c feature/wp-frontend-06-speakers origin/main`.
2. Подготовь worktree (команды из `orch.yaml`, выполнять внутри worktree):

   ```bash
   pnpm install --frozen-lockfile
   pnpm --filter @transcrib/api run db:generate
   ```
3. Правь только разрешённые пути; общие пути — только объявленные в шапке и после получения замка.

## 1. Факты

- Аналитика обратной связи 2026-10-08 (`reports/feedback-analysis-20261008.md`): из 18 пунктов пользователя 7 — про имена/роли спикеров, 2 — про диаризацию, 1 новая находка — утечка памяти проекта и списка участников в протокол чужой встречи. Решение владельца — D-38.
- Правило промпта `<speaker_mapping>` (`worker/src/llm/prompts/ru/protocol-context.md:45-52`): «Speaker N» заменяется именем только при явном свидетельстве в транскрипте; список участников, их число и порядок реплик — не свидетельство. Поэтому в протоколах 12.05 (8 голосов) 7 меток остались без имён, а Haiku 5.5 при попытке сопоставить ошиблась (TCB B: Speaker 1 → Роман Клин без свидетельства).
- Карта спикеров уже существует: `transcripts.speaker_map` JSONB `{ "SPEAKER_0": "Имя" | null }` заполняется `resolveSpeakers` (`worker/src/jobs/transcription.ts:76-108`, по самопредставлению), `raw_text` строится `buildFullText(segments, speakerMap)` (`:116`) как строки `[MM:SS] Имя|Speaker N: текст`; сегменты с метками — `transcripts.segments_blob` (`{start,end,text,speaker}`); промпт понимает строки `"[MM:SS] Name: text"` (`protocol-context.md:26`). Генерация читает `transcript.rawText` (`worker/src/jobs/protocol-generation.ts:322,328`).
- После распознавания воркер сразу ставит `TRANSCRIBED` и создаёт `ProtocolGenerationJob` (`transcription.ts:313-316, 334`, RQ-016). Статусы: `MeetingStatus` в `api/prisma/schema.prisma:14-27` (есть `AWAITING_START` из D-9) и `shared/src/api/uc002.ts`; retry — `api/src/routes/uc-004.ts`, постановка задания из api — `api/src/queue.ts:74 enqueueProtocolGenerationJob`.
- Deepgram: число спикеров до диаризации не доходит и в документации диаризации параметра нет (D-21, `worker/src/asr/deepgram-adapter.ts:219-223`); диаризация вариативна (12.05: 7→8→8 голосов; TCB: 3→4→3). Пересегментация (один человек — две метки) лечится объединением меток при подтверждении; недосегментация (двое — одна метка, 20.05 Степан/Ярослав) без повторной диаризации не лечится — ограничение.
- Карточка встречи: `web/src/routes/meeting/index.tsx` (+ `StatusSection.tsx`, `JobErrorBanner.tsx`, `RetryProcessingButton.tsx`); фичи подключаются реестром `web/src/lib/features.ts` (`routes`, `navItems`, `slots`), слоты пока только `header.right`, `protocol.toolbar`; статус приходит через SSE `GET /api/meetings/:id/events`.

## 2. Объём

1. На карточке встречи в статусе `AWAITING_SPEAKERS` — блок «Подтвердите спикеров» (фича `web/src/features/speakers/**` или внутри `routes/meeting/**`, по текущему паттерну): для каждой метки — «Speaker N», длительность, 3 цитаты; выбор: участник проекта (список из ответа), «другое имя» (поле), «тот же человек, что Speaker K» (объединение), «оставить как есть»; кнопки «Подтвердить и сделать протокол» и «Пропустить» (генерация без имён). Подсказка про ограничение: разделить одну метку на двух людей нельзя.
2. После PUT — статус `GENERATING_PROTOCOL`, обычный прогресс; ошибки 409/404 — понятные тексты. Статус `AWAITING_SPEAKERS` в списке задач и на карточке (подпись, цвет), i18n RU/EN.
3. Тесты компонентов (RTL): рендер меток и цитат, объединение, валидация (имя не пустое), отправка тела по контракту, обработка 409.
4. Не менять: страницу протокола, загрузку, другие фичи.
5. Из ревью WP-BACKEND-07 (reports/wp-backend-07-review-20261008.md): карты статусов, которые не знают `AWAITING_SPEAKERS` и входят в объём этого пакета — `web/src/i18n/{ru,en}.json` (`catalog.status.*`), `web/src/routes/catalog/index.tsx` (`TRANSIENT_STATUSES` — новый статус НЕ переходный: ждёт пользователя, не поллить), `web/src/routes/meeting/components/StatusBadge.tsx` (вариант), `StatusSection.tsx` (`TRANSCRIPT_STATUSES`). Ограничение API: `GET /api/meetings/:id/transcript` в `AWAITING_SPEAKERS` отвечает 409 `STATUS_NOT_READY` — экран показывает образцы из `GET /speakers`, кнопку «Транскрипт» в этом статусе не показывать (или дизейблить с подсказкой).

### Не входит

- merge, деплой, PROD, запись в БД
- другие модули и рабочее пространство оркестратора
- файлы вне разрешённых путей; общие пути, не объявленные выше
- подъём версий и release notes, если не перечислены выше

## 3. Критерии приёмки

1. Тесты: блок виден только в `AWAITING_SPEAKERS`; тело PUT соответствует `SpeakersPutRequest` для трёх сценариев (участник, имя, объединение); «Пропустить» шлёт `action: 'skip'`; 409 показывает сообщение и перезапрашивает статус.
2. Статус отображается в списке задач и на карточке на RU и EN.
3. `pnpm -r typecheck`, `pnpm test` зелёные; скриншот экрана в PR (локальный `/nacl-tl-qa` с моком API).

## 4. Порядок сдачи

- PR из `feature/wp-frontend-06-speakers` в `main`; не мержить.
- Тело PR = отчёт разработки + `Deviations` (чем результат отличается от пакета и почему).
- Затем сообщение `product-coord`: `[PRODUCT] READY WP-FRONTEND-06 :: <sha> :: ref=<PR URL>`.

## 5. Start prompt

```text
Прочитай /home/cloudpc/projects/transcriber-orch/docs/orchestration/product/work-packages/WP-FRONTEND-06-speakers.md и выполни. Сначала раздел 0 (подготовка worktree). Ветка feature/wp-frontend-06-speakers от origin/main, PR в main, не мержить. По готовности — сообщение product-coord: [PRODUCT] READY WP-FRONTEND-06 :: <sha> :: ref=<PR URL>

Before implementing, read both CLAUDE.md and AGENTS.md (including existing case variants)
and the applicable nested instruction files. Preserve all existing client-specific text.
If one file is missing or shared blocks differ, prepare confirmed common project rules and
use orch.py instructions status/sync with both expected hashes. Update both shared blocks
when a common rule changes. Do not decide contradictory existing instructions yourself:
send QUESTION with the conflict. Run orch.py instructions check --repo . before READY.
Only the module session edits its repository's instructions; the coordinator never does.

```

### Start command

Команда запуска (владельцу, в новом терминале):

```bash
cd /home/cloudpc/projects/transcriber && claude -w wp-frontend-06-speakers --model sonnet --name product-frontend "Прочитай /home/cloudpc/projects/transcriber-orch/docs/orchestration/product/work-packages/WP-FRONTEND-06-speakers.md и выполни. Сначала раздел 0 (подготовка worktree). Ветка feature/wp-frontend-06-speakers от origin/main, PR в main, не мержить. По готовности — сообщение product-coord: [PRODUCT] READY WP-FRONTEND-06 :: <sha> :: ref=<PR URL>

Before implementing, read both CLAUDE.md and AGENTS.md (including existing case variants)
and the applicable nested instruction files. Preserve all existing client-specific text.
If one file is missing or shared blocks differ, prepare confirmed common project rules and
use orch.py instructions status/sync with both expected hashes. Update both shared blocks
when a common rule changes. Do not decide contradictory existing instructions yourself:
send QUESTION with the conflict. Run orch.py instructions check --repo . before READY.
Only the module session edits its repository's instructions; the coordinator never does.
"
```

`orch.py dispatch` добавляет к этой команде `--permission-mode` и `--settings <рабочее пространство>/orchestration/settings/<модуль>.json`: запускай сессию командой, которую печатает dispatch.

## 6. Если отказано

Сессия запускается с `--settings`, сгенерированным для её модуля командой `orch.py settings`: чтение, тесты и коммиты разрешены, push ветки пакета решает классификатор; merge, push в `main`, релизы, запуск workflow, прод и рабочее пространство оркестратора запрещены.

- Отказ правила или классификатора auto mode — это ответ: не обходить его (никаких `sh -c`, `git -C`, переименованных или скопированных команд, никакого копирования или правки файлов настроек и `.claude/`).
- Сообщение о недоступности классификатора (решение не принято) — не вердикт: повтори ту же команду позже.
- Дефект самого плагина (неверное сгенерированное правило, ошибка скрипта) оркестратор сообщает режимом `report`; плагин и его настройки не правь.
- Пришли `product-coord`: `[PRODUCT] QUESTION WP-FRONTEND-06 :: отказ: <точный текст отказа> :: ref=<команда>`; продолжай работу, которой это не нужно, или жди `ANSWER`.
- Ресурсы по запросу (`graph`, `dev-stack`): перед использованием пришли `product-coord`: `[PRODUCT] LOCK WP-FRONTEND-06 :: <ресурс> :: ref=<зачем>` и жди `ACK`; как только закончишь — `[PRODUCT] UNLOCK WP-FRONTEND-06 :: <ресурс> :: ref=<результат>`. READY возвращает все замки по запросу.

## Пересдачи

<Циклы REVISE: дата, пункты, коммит.>
