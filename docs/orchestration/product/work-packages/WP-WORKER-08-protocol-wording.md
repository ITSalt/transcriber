# WP-WORKER-08 — Протокол: «## Поручения», «Спикер N», отказ от speakerCount в ASR

| Поле | Значение |
|------|----------|
| Поток | worker (area) |
| Репозиторий | /home/cloudpc/projects/transcriber |
| Базовая ветка | main |
| Линия | main |
| Рабочая ветка | `feature/wp-worker-08-protocol-wording` |
| Worktree | `.claude/worktrees/wp-worker-08-protocol-wording` (создаёт `claude -w wp-worker-08-protocol-wording`) |
| Заголовок PR | `[PRODUCT] WP-WORKER-08: Протокол: «## Поручения», «Спикер N», отказ от speakerCount в ASR` |
| Сессия | `product-worker` |
| Модель | `sonnet` |
| Усилие | — |
| Почему такая модель | модель реализатора по умолчанию (orch.yaml models.implement) |
| Режим | nacl: `/nacl-tl-dev-be` по TDD (промпты, валидация секций, формат меток), `/nacl-tl-review --be` |
| Команды методологии: разрешены | nacl: `nacl-tl-dev-be`, `nacl-tl-dev`, `nacl-tl-fix`, `nacl-tl-review`, `nacl-tl-regression-test`, `nacl-tl-verify-code`, `nacl-tl-sync`, `nacl-tl-docs`, `nacl-tl-stubs`, `nacl-sa-uc`, `nacl-sa-domain`, `nacl-sa-feature`, `nacl-sa-validate`, `nacl-tl-plan`, `nacl-tl-status` |
| Команды методологии: запрещены | `nacl-tl-release`, `nacl-tl-deploy`, `nacl-tl-deliver`, `nacl-tl-hotfix`, `nacl-tl-ship`, `nacl-tl-conductor`, `nacl-tl-full`, `nacl-goal`, `nacl-publish` |
| Разрешённые пути | `worker/{tsconfig.json,vitest.config.ts}`, `worker/test/**`, `worker/src/{asr,jobs,lib,llm}/**`, `worker/src/{config.ts,config.test.ts,logger.ts,shutdown.ts,shutdown.test.ts,job-processor.test.ts,queues.test.ts,queues.regression.test.ts}` |
| Общие пути, которые трогает пакет | `shared/**` (`shared/src/asr/IAsrProvider.ts:38` — удалить `speakerCount`; LOCK до правки) |
| Миграции | нет |
| Ресурсы (замки) | нет |
| Тестовая БД и порты | нет; нет |
| Слот слияния | <место в очереди слияний, задаётся при приёмке> |
| Контракт | меняет `IAsrProvider.AudioInput` (минус `speakerCount`); полезную нагрузку задания `uc200.ts` (`speaker_count`) НЕ трогать — удалит WP-BACKEND-08; воркер перестаёт её читать |
| Зависит от | нет (сливается до WP-BACKEND-08) |
| Размер | M |
| Спецификация | UC-300, UC-200, RQ-060; отчёт 4.4, U6, D-43 |
| Граф | нет (промпты — код; секция протокола в спецификации UC-300 правится WP-SPEC-01 по уведомлению: сообщи оркестратору QUESTION, если UC-300 описывает заголовки секций) |
| Решения | D-41, D-42, D-43, D-21 |

Общие пути этого репозитория (объяви те, что трогает пакет): `pnpm-lock.yaml`, `package.json`, `**/package.json`, `shared/**`, `api/prisma/**`, `.tl/{status.json,master-plan.md,changelog.md,release-status.json,deploy-plan.md}`, `.tl/external-contracts/**`, `graph-infra/**`, `config.yaml`, `CLAUDE.md`, `api/src/server.ts`, `worker/src/index.ts`, `worker/src/job-processor.ts`, `worker/src/queues.ts`, `web/src/App.tsx`, `web/src/i18n/**`.
Ресурсы этого репозитория, требующие замка: `migrations`, `graph` (по запросу: LOCK/UNLOCK, см. раздел 6), `dev-stack` (по запросу: LOCK/UNLOCK, см. раздел 6).

## 0. Подготовка worktree

1. Переключи worktree на ветку пакета: `git fetch origin && git switch -c feature/wp-worker-08-protocol-wording origin/main`.
2. Подготовь worktree (команды из `orch.yaml`, выполнять внутри worktree):

   ```bash
   pnpm install --frozen-lockfile
   pnpm --filter @transcrib/api run db:generate
   ```
3. Правь только разрешённые пути; общие пути — только объявленные в шапке и после получения замка.

## 1. Факты

- Ревизия терминологии 2026-10-09 (`reports/terminology-audit-20261009.md`): владелец отменил A-2 («задача в UI = Meeting»). Словарь: «встреча» — то, что загружаем (Meeting); «поручение» — задание участнику встречи с контекстом и сроком (реестр проекта T-n, секция протокола); слово «задача» в продукте не используется ни в одном значении; фоновые работы — «обработка»; метка неподтверждённого спикера — «Спикер N» как в транскрипте (D-40, D-41, D-42). Идентификаторы кода (`Task`, `/api/projects/:id/tasks`, `T-n`, `SPEAKER_n`) не меняются.
- Код уже говорит правильно: `Meeting`/`/api/meetings`, `/api/projects/:projectId/tasks`, секции протокола `['## Участники','## Обсуждение','## Решения','## Задачи']` (`worker/src/jobs/protocol-generation.ts:85`). Расхождение живёт в строках интерфейса, промптах, тестах и графе спецификации.
- Секции: `worker/src/jobs/protocol-generation.ts:85` `RU: ['## Участники','## Обсуждение','## Решения','## Задачи']`; промпты `worker/src/llm/prompts/ru/protocol.md:24,54,86-90` и `protocol-context.md:42,53,90,123-128` требуют «## Задачи», «Задачи не зафиксированы.», «[Ответственный]: [Задача] (срок: …)», «T-[N]: [Задача из прошлого протокола…]»; guard `worker/src/llm/protocol-guard.ts:20` ищет «## Участники|Participants». Старые протоколы в БД содержат «## Задачи» и не переписываются.
- Метка спикера в тексте транскрипта для LLM: `worker/src/lib/transcript-text.ts:34` → `Speaker ${n+1}`; промпт `protocol-context.md:26,32,46-51` говорит о «Speaker N» и правилах замены; подтверждённые имена приходят из `transcripts.speaker_mapping` (WP-WORKER-06). Транскрипт в UI показывает «Спикер N» (`web/src/routes/transcript/components/SpeakerLabel.tsx:20`); по D-41 — единообразно «Спикер N».
- `speakerCount`: `shared/src/asr/IAsrProvider.ts:38`, `worker/src/jobs/transcription.ts:149-152,246` читает `job.data.speaker_count` и передаёт в адаптер; адаптер не отправляет (`deepgram-adapter.ts:219-223`). По D-43 удалить.

## 2. Объём

1. Промпты RU (`protocol.md`, `protocol-context.md`): секция «## Поручения», «Поручения не зафиксированы.», «[Ответственный]: [Поручение] (срок: …)», «T-[N]: [Поручение из прошлого протокола или памяти проекта] — …»; слово «задача» в русских строках промптов не остаётся (английские инструкции могут говорить «tasks/action items»). EN промпты: «## Action items» → не менять, если UC-300 EN уже так; иначе не трогать.
2. `REQUIRED_SECTIONS.RU` = «## Поручения»; всё, что читает протокол (guard, парсеры секций, память — `worker/src/memory/**` не в области: если там есть разбор «## Задачи», сообщи QUESTION), принимает оба заголовка «## Задачи» и «## Поручения» (старые протоколы, предыдущий протокол в контексте).
3. Метка спикера для LLM: `transcript-text.ts` формирует «Спикер N» для RU-протокола (язык встречи `MeetingLanguage`/язык протокола) и «Speaker N» для EN; промпт RU: правила о «Speaker N» переписать на «Спикер N», добавить, что обе формы означают неподтверждённую метку (транскрипты старых встреч).
4. Удалить `speakerCount` из `IAsrProvider.AudioInput` (shared, замок), из адаптера Deepgram (комментарий D-21 сократить до ссылки) и из `transcription.ts` (чтение `job.data.speaker_count` убрать; тип полезной нагрузки из `uc200.ts` пока содержит поле — не использовать).
5. Тесты: секции (оба заголовка принимаются, новый генерируется), метка «Спикер N» в тексте для LLM по языку, wire-тест Deepgram без `min_speakers/max_speakers` (есть) — без `speakerCount` в типах.

### Не входит

- merge, деплой, PROD, запись в БД
- другие модули и рабочее пространство оркестратора
- файлы вне разрешённых путей; общие пути, не объявленные выше
- подъём версий и release notes, если не перечислены выше

## 3. Критерии приёмки

1. `grep -n "Задач" worker/src/llm/prompts/ru/*.md` пуст; `grep -rn "speakerCount" worker/src shared/src` пуст (кроме тестов старого формата, если оставлены сознательно — тогда 0).
2. `pnpm --filter @transcrib/worker test`, `pnpm --filter @transcrib/shared build`, `pnpm -r typecheck` зелёные (api продолжает компилироваться: `speaker_count` остаётся в `uc200.ts`).
3. На проде после доставки: новая встреча с контекстом → протокол содержит «## Поручения» и ни одного «Speaker N» (SELECT `protocols.markdown_content`); старая встреча с «## Задачи» открывается и память по ней не ломается (повторная генерация по retry — без ошибок валидации секций).

## 4. Порядок сдачи

- PR из `feature/wp-worker-08-protocol-wording` в `main`; не мержить.
- Тело PR = отчёт разработки + `Deviations` (чем результат отличается от пакета и почему).
- Затем сообщение `product-coord`: `[PRODUCT] READY WP-WORKER-08 :: <sha> :: ref=<PR URL>`.

## 5. Start prompt

```text
Прочитай /home/cloudpc/projects/transcriber-orch/docs/orchestration/product/work-packages/WP-WORKER-08-protocol-wording.md и выполни. Сначала раздел 0 (подготовка worktree). Ветка feature/wp-worker-08-protocol-wording от origin/main, PR в main, не мержить. По готовности — сообщение product-coord: [PRODUCT] READY WP-WORKER-08 :: <sha> :: ref=<PR URL>

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
cd /home/cloudpc/projects/transcriber && claude -w wp-worker-08-protocol-wording --model sonnet --name product-worker "Прочитай /home/cloudpc/projects/transcriber-orch/docs/orchestration/product/work-packages/WP-WORKER-08-protocol-wording.md и выполни. Сначала раздел 0 (подготовка worktree). Ветка feature/wp-worker-08-protocol-wording от origin/main, PR в main, не мержить. По готовности — сообщение product-coord: [PRODUCT] READY WP-WORKER-08 :: <sha> :: ref=<PR URL>

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
- Пришли `product-coord`: `[PRODUCT] QUESTION WP-WORKER-08 :: отказ: <точный текст отказа> :: ref=<команда>`; продолжай работу, которой это не нужно, или жди `ANSWER`.
- Ресурсы по запросу (`graph`, `dev-stack`): перед использованием пришли `product-coord`: `[PRODUCT] LOCK WP-WORKER-08 :: <ресурс> :: ref=<зачем>` и жди `ACK`; как только закончишь — `[PRODUCT] UNLOCK WP-WORKER-08 :: <ресурс> :: ref=<результат>`. READY возвращает все замки по запросу.

## Пересдачи

<Циклы REVISE: дата, пункты, коммит.>
