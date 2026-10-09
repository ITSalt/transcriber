# WP-FRONTEND-07 — Единая терминология в строках ядра: «Встречи», «обработка», «Спикер N», род статусов

| Поле | Значение |
|------|----------|
| Поток | frontend (area) |
| Репозиторий | /home/cloudpc/projects/transcriber |
| Базовая ветка | main |
| Линия | main |
| Рабочая ветка | `feature/wp-frontend-07-wording` |
| Worktree | `.claude/worktrees/wp-frontend-07-wording` (создаёт `claude -w wp-frontend-07-wording`) |
| Заголовок PR | `[PRODUCT] WP-FRONTEND-07: Единая терминология в строках ядра: «Встречи», «обработка», «Спикер N», род статусов` |
| Сессия | `product-frontend` |
| Модель | `sonnet` |
| Усилие | — |
| Почему такая модель | модель реализатора по умолчанию (orch.yaml models.implement) |
| Режим | nacl: `/nacl-tl-dev-fe` по TDD (строки + тесты), `/nacl-tl-qa` локально; графа не трогать (подписи форм правит WP-SPEC-01) |
| Команды методологии: разрешены | nacl: `nacl-tl-dev-fe`, `nacl-tl-fix`, `nacl-tl-review`, `nacl-tl-regression-test`, `nacl-tl-verify-code`, `nacl-tl-sync`, `nacl-tl-docs`, `nacl-tl-stubs`, `nacl-tl-qa`, `nacl-sa-ui`, `nacl-tl-status` |
| Команды методологии: запрещены | `nacl-tl-release`, `nacl-tl-deploy`, `nacl-tl-deliver`, `nacl-tl-hotfix`, `nacl-tl-ship`, `nacl-tl-conductor`, `nacl-tl-full`, `nacl-goal`, `nacl-publish` |
| Разрешённые пути | `web/{index.html,vite.config.ts,tsconfig.json,tsconfig.node.json,vitest.config.ts,README.md}`, `web/public/**`, `web/src/{main.tsx,App.test.tsx,test-setup.ts,vite-env.d.ts}`, `web/src/styles/**`, `web/src/components/**`, `web/src/lib/**`, `web/src/i18n/**`, `web/src/routes/{catalog,meeting,transcript}/**`, `web/src/features/{shell,auth,tasks,speakers}/**` |
| Общие пути, которые трогает пакет | `web/src/i18n/**` (ru.json, en.json — LOCK до правки) |
| Миграции | нет |
| Ресурсы (замки) | нет |
| Тестовая БД и порты | нет; нет |
| Слот слияния | <место в очереди слияний, задаётся при приёмке> |
| Контракт | нет |
| Зависит от | нет |
| Размер | S |
| Спецификация | UC-001, UC-002, UC-100, UC-201, UC-505; отчёт 4.1, 4.2, U5, U7, U8, U9 |
| Граф | нет |
| Решения | D-40, D-41, D-42 |

Общие пути этого репозитория (объяви те, что трогает пакет): `pnpm-lock.yaml`, `package.json`, `**/package.json`, `shared/**`, `api/prisma/**`, `.tl/{status.json,master-plan.md,changelog.md,release-status.json,deploy-plan.md}`, `.tl/external-contracts/**`, `graph-infra/**`, `config.yaml`, `CLAUDE.md`, `api/src/server.ts`, `worker/src/index.ts`, `worker/src/job-processor.ts`, `worker/src/queues.ts`, `web/src/App.tsx`, `web/src/i18n/**`.
Ресурсы этого репозитория, требующие замка: `migrations`, `graph` (по запросу: LOCK/UNLOCK, см. раздел 6), `dev-stack` (по запросу: LOCK/UNLOCK, см. раздел 6).

## 0. Подготовка worktree

1. Переключи worktree на ветку пакета: `git fetch origin && git switch -c feature/wp-frontend-07-wording origin/main`.
2. Подготовь worktree (команды из `orch.yaml`, выполнять внутри worktree):

   ```bash
   pnpm install --frozen-lockfile
   pnpm --filter @transcrib/api run db:generate
   ```
3. Правь только разрешённые пути; общие пути — только объявленные в шапке и после получения замка.

## 1. Факты

- Ревизия терминологии 2026-10-09 (`reports/terminology-audit-20261009.md`): владелец отменил A-2 («задача в UI = Meeting»). Словарь: «встреча» — то, что загружаем (Meeting); «поручение» — задание участнику встречи с контекстом и сроком (реестр проекта T-n, секция протокола); слово «задача» в продукте не используется ни в одном значении; фоновые работы — «обработка»; метка неподтверждённого спикера — «Спикер N» как в транскрипте (D-40, D-41, D-42). Идентификаторы кода (`Task`, `/api/projects/:id/tasks`, `T-n`, `SPEAKER_n`) не меняются.
- Код уже говорит правильно: `Meeting`/`/api/meetings`, `/api/projects/:projectId/tasks`, секции протокола `['## Участники','## Обсуждение','## Решения','## Задачи']` (`worker/src/jobs/protocol-generation.ts:85`). Расхождение живёт в строках интерфейса, промптах, тестах и графе спецификации.
- `web/src/i18n/ru.json:17` `nav.catalog` = «Задачи», `:21` `catalog.title` = «Задачи», `:22` `catalog.tableLabel` = «Список задач», `:23` `catalog.empty` = «Задач пока нет…», `:162` `notFound.back` = «К задачам»; `en.json` те же ключи «Tasks/Task list/No tasks yet/Back to tasks»; тесты `web/src/routes/catalog/index.test.tsx` называют строки «task» (4 вхождения).
- `ru.json:80` `meeting.delete.inFlightWarning` = «Задача выполняется прямо сейчас…» — речь о фоновой обработке; `en.json` — «A job is currently in progress…».
- `ru.json:49` блок `meeting.status.*` (ключи `pending`, `done`, …) не используется ни одним компонентом (`grep -rn "meeting.status\." web/src` пуст) — дубль `catalog.status.*`.
- `catalog.status.*` (ru.json:32): род смешан — «Создана» (ж.), «Загружено», «Транскрибировано», «Отредактировано» (ср.) при подлежащем «встреча»; «Транскрибирование» против «Начать распознавание» (`features/context/i18n/ru.json` `start.button`).
- Загрузка: `upload.heading` = «Загрузить видео встречи», `upload.fieldFile` = «Видеофайл…», но `upload.dragDrop` = «Перетащите видео или аудио файл сюда»; ключ `upload.title` («Загрузить запись») не используется.
- Спикеры: `web/src/routes/transcript/components/SpeakerLabel.tsx:20` показывает `t("transcript.speakerLabel")` = «Спикер {{n}}»; экран подтверждения `web/src/features/speakers/i18n/ru.json:3` пишет «Speaker N», а `display` из API (`api/src/features/speakers/service.ts:105`) = `Speaker ${n+1}`; тест `speakers.test.tsx:224` ожидает, что объединение шлёт `display` корня как имя.
- Карточка встречи `web/src/routes/meeting/index.tsx:82-96`: заголовка H1 нет, первая карточка — «Детали встречи» (`meeting.detail.metadataTitle`), название — одна из строк таблицы.

## 2. Объём

1. Строки RU/EN ядра (`web/src/i18n/{ru,en}.json`): `nav.catalog` «Встречи»/«Meetings»; `catalog.title` «Встречи», `catalog.tableLabel` «Список встреч», `catalog.empty` «Встреч пока нет. Загрузите запись, чтобы начать.», `notFound.back` «К встречам» (EN соответственно); `meeting.delete.inFlightWarning` «Обработка идёт прямо сейчас и будет прервана с ошибкой.»; удалить неиспользуемый блок `meeting.status.*` и ключ `upload.title`.
2. Статусы `catalog.status.*` в одном роде (подлежащее «встреча»): «Создана», «Загружается», «Загружена», «Распознаётся», «Распознана», «Ожидает подтверждения спикеров», «Протокол готовится», «Протокол готов», «Отредактирована», «Ошибка»; EN без изменений смысла.
3. Загрузка (строки ядра `upload.*`, компонент страницы в другом модуле не трогать): «Загрузить запись встречи», «Файл записи (видео или аудио; MP4 / MKV / MOV / WEBM, макс. 2,5 ГБ, макс. 4 ч)».
4. Спикеры (`web/src/features/speakers/**`): все подписи через `t("transcript.speakerLabel")`-подобный формат «Спикер N» (RU) / «Speaker N» (EN), включая `intro`, подписи меток и имя, которое отправляется при объединении (сейчас `display` корня); тест `speakers.test.tsx:224` обновить. Поле `display` из API игнорировать, N брать из `label` `SPEAKER_n` (n+1).
5. Карточка встречи: H1 = `meeting.title ?? recording.filename`, под ним дата загрузки; «Детали встречи» → «Сведения»; `meeting.detail.viewProtocol` → «Открыть протокол».
6. Тесты: переименовать описания в `routes/catalog/index.test.tsx`, добавить проверку, что `ru.json` не содержит подстроки «задач» (unit-тест по JSON) и что все `catalog.status.*` присутствуют для каждого значения `MeetingStatus`.

### Не входит

- merge, деплой, PROD, запись в БД
- другие модули и рабочее пространство оркестратора
- файлы вне разрешённых путей; общие пути, не объявленные выше
- подъём версий и release notes, если не перечислены выше

## 3. Критерии приёмки

1. `grep -ci "задач" web/src/i18n/ru.json` = 0; `grep -c "Speaker N" web/src/features/speakers/i18n/ru.json` = 0.
2. Тесты каталога, карточки встречи и экрана спикеров зелёные; `pnpm --filter @transcrib/web test` и `pnpm -r typecheck` зелёные.
3. На проде после доставки (verify оркестратора): меню «Встречи», заголовок «Встречи», пустое состояние и 404 без слова «задачи»; статусы в списке в женском роде; на экране подтверждения «Спикер 1…N»; у карточки встречи H1 с названием.
4. Объединение меток на проде даёт в `transcripts.speaker_mapping` имя «Спикер K» для объединённого корня (SELECT) и протокол без «Speaker N».

## 4. Порядок сдачи

- PR из `feature/wp-frontend-07-wording` в `main`; не мержить.
- Тело PR = отчёт разработки + `Deviations` (чем результат отличается от пакета и почему).
- Затем сообщение `product-coord`: `[PRODUCT] READY WP-FRONTEND-07 :: <sha> :: ref=<PR URL>`.

## 5. Start prompt

```text
Прочитай /home/cloudpc/projects/transcriber-orch/docs/orchestration/product/work-packages/WP-FRONTEND-07-wording.md и выполни. Сначала раздел 0 (подготовка worktree). Ветка feature/wp-frontend-07-wording от origin/main, PR в main, не мержить. По готовности — сообщение product-coord: [PRODUCT] READY WP-FRONTEND-07 :: <sha> :: ref=<PR URL>

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
cd /home/cloudpc/projects/transcriber && claude -w wp-frontend-07-wording --model sonnet --name product-frontend "Прочитай /home/cloudpc/projects/transcriber-orch/docs/orchestration/product/work-packages/WP-FRONTEND-07-wording.md и выполни. Сначала раздел 0 (подготовка worktree). Ветка feature/wp-frontend-07-wording от origin/main, PR в main, не мержить. По готовности — сообщение product-coord: [PRODUCT] READY WP-FRONTEND-07 :: <sha> :: ref=<PR URL>

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
- Пришли `product-coord`: `[PRODUCT] QUESTION WP-FRONTEND-07 :: отказ: <точный текст отказа> :: ref=<команда>`; продолжай работу, которой это не нужно, или жди `ANSWER`.
- Ресурсы по запросу (`graph`, `dev-stack`): перед использованием пришли `product-coord`: `[PRODUCT] LOCK WP-FRONTEND-07 :: <ресурс> :: ref=<зачем>` и жди `ACK`; как только закончишь — `[PRODUCT] UNLOCK WP-FRONTEND-07 :: <ресурс> :: ref=<результат>`. READY возвращает все замки по запросу.

## Пересдачи

<Циклы REVISE: дата, пункты, коммит.>
