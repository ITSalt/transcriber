# WP-WEB-MEMORY-02 — «Поручения» вместо «задач» в памяти проекта

| Поле | Значение |
|------|----------|
| Поток | web-memory (area) |
| Репозиторий | /home/cloudpc/projects/transcriber |
| Базовая ветка | main |
| Линия | main |
| Рабочая ветка | `feature/wp-web-memory-02-assignments` |
| Worktree | `.claude/worktrees/wp-web-memory-02-assignments` (создаёт `claude -w wp-web-memory-02-assignments`) |
| Заголовок PR | `[PRODUCT] WP-WEB-MEMORY-02: «Поручения» вместо «задач» в памяти проекта` |
| Сессия | `product-web-memory` |
| Модель | `sonnet` |
| Усилие | — |
| Почему такая модель | модель реализатора по умолчанию (orch.yaml models.implement) |
| Режим | nacl: `/nacl-tl-dev-fe` (строки + тесты); графа не трогать |
| Команды методологии: разрешены | nacl: `nacl-tl-dev-fe`, `nacl-tl-fix`, `nacl-tl-review`, `nacl-tl-regression-test`, `nacl-tl-verify-code`, `nacl-tl-sync`, `nacl-tl-docs`, `nacl-tl-stubs`, `nacl-tl-qa`, `nacl-sa-ui`, `nacl-tl-status` |
| Команды методологии: запрещены | `nacl-tl-release`, `nacl-tl-deploy`, `nacl-tl-deliver`, `nacl-tl-hotfix`, `nacl-tl-ship`, `nacl-tl-conductor`, `nacl-tl-full`, `nacl-goal`, `nacl-publish` |
| Разрешённые пути | `web/src/features/memory/**` |
| Общие пути, которые трогает пакет | нет |
| Миграции | нет |
| Ресурсы (замки) | нет |
| Тестовая БД и порты | нет; нет |
| Слот слияния | <место в очереди слияний, задаётся при приёмке> |
| Контракт | нет |
| Зависит от | нет |
| Размер | S |
| Спецификация | UC-601, UC-602, UC-603, UC-604; отчёт 4.4 |
| Граф | нет |
| Решения | D-40, D-42 |

Общие пути этого репозитория (объяви те, что трогает пакет): `pnpm-lock.yaml`, `package.json`, `**/package.json`, `shared/**`, `api/prisma/**`, `.tl/{status.json,master-plan.md,changelog.md,release-status.json,deploy-plan.md}`, `.tl/external-contracts/**`, `graph-infra/**`, `config.yaml`, `CLAUDE.md`, `api/src/server.ts`, `worker/src/index.ts`, `worker/src/job-processor.ts`, `worker/src/queues.ts`, `web/src/App.tsx`, `web/src/i18n/**`.
Ресурсы этого репозитория, требующие замка: `migrations`, `graph` (по запросу: LOCK/UNLOCK, см. раздел 6), `dev-stack` (по запросу: LOCK/UNLOCK, см. раздел 6).

## 0. Подготовка worktree

1. Переключи worktree на ветку пакета: `git fetch origin && git switch -c feature/wp-web-memory-02-assignments origin/main`.
2. Подготовь worktree (команды из `orch.yaml`, выполнять внутри worktree):

   ```bash
   pnpm install --frozen-lockfile
   pnpm --filter @transcrib/api run db:generate
   ```
3. Правь только разрешённые пути; общие пути — только объявленные в шапке и после получения замка.

## 1. Факты

- Ревизия терминологии 2026-10-09 (`reports/terminology-audit-20261009.md`): владелец отменил A-2 («задача в UI = Meeting»). Словарь: «встреча» — то, что загружаем (Meeting); «поручение» — задание участнику встречи с контекстом и сроком (реестр проекта T-n, секция протокола); слово «задача» в продукте не используется ни в одном значении; фоновые работы — «обработка»; метка неподтверждённого спикера — «Спикер N» как в транскрипте (D-40, D-41, D-42). Идентификаторы кода (`Task`, `/api/projects/:id/tasks`, `T-n`, `SPEAKER_n`) не меняются.
- Код уже говорит правильно: `Meeting`/`/api/meetings`, `/api/projects/:projectId/tasks`, секции протокола `['## Участники','## Обсуждение','## Решения','## Задачи']` (`worker/src/jobs/protocol-generation.ts:85`). Расхождение живёт в строках интерфейса, промптах, тестах и графе спецификации.
- `web/src/features/memory/i18n/ru.json:4` `tabs.tasks` = «Задачи», `:88` `refs.tasks` = «Задачи»; строки `tasks.empty` «Задач пока нет.», `edit.title` «Правка задачи», `decisions.leadsTo` «Привело к задачам», `tasks.pending` «ждут подтверждения: N», `detail.title` «История {{code}}» — всё о поручениях реестра (T-n).
- Вкладки памяти встроены в карточку проекта через слот `project.tabs` (`web/src/features/memory/index.ts`), маршрутов у фичи нет; по D-42 сводной страницы не делаем.

## 2. Объём

1. Все строки `features/memory/i18n/{ru,en}.json`: «Поручения»/«Assignments» вместо «Задачи»/«Tasks» (вкладка, ссылки «Из памяти проекта», пустые состояния, «Правка поручения», «Привело к поручениям», «поручений ждут подтверждения», фильтры, подписи полей); коды T-n, статусы «Открыто/В работе/Выполнено/Отменено/Отложено» согласовать в роде с «поручение» (ср. род).
2. Тексты очереди подтверждения и истории поручения: «Было/Стало», «Создано во встрече», «Упоминания» — проверить род и слово «задача» в `components/*.tsx` (`grep -n "задач" web/src/features/memory`), заголовки через i18n.
3. Тесты `memory.test.tsx`: обновить ожидаемые подписи; unit-тест: `ru.json` фичи не содержит «задач».

### Не входит

- merge, деплой, PROD, запись в БД
- другие модули и рабочее пространство оркестратора
- файлы вне разрешённых путей; общие пути, не объявленные выше
- подъём версий и release notes, если не перечислены выше

## 3. Критерии приёмки

1. `grep -rci "задач" web/src/features/memory/` = 0 (включая тесты, кроме названий API-маршрутов `/tasks`).
2. `pnpm --filter @transcrib/web test`, `pnpm -r typecheck` зелёные.
3. На проде: карточка проекта → вкладка «Поручения», пустое состояние «Поручений пока нет.», очередь «На подтверждение» и правка поручения без слова «задача» (verify оркестратора по скриншоту).

## 4. Порядок сдачи

- PR из `feature/wp-web-memory-02-assignments` в `main`; не мержить.
- Тело PR = отчёт разработки + `Deviations` (чем результат отличается от пакета и почему).
- Затем сообщение `product-coord`: `[PRODUCT] READY WP-WEB-MEMORY-02 :: <sha> :: ref=<PR URL>`.

## 5. Start prompt

```text
Прочитай /home/cloudpc/projects/transcriber-orch/docs/orchestration/product/work-packages/WP-WEB-MEMORY-02-assignments.md и выполни. Сначала раздел 0 (подготовка worktree). Ветка feature/wp-web-memory-02-assignments от origin/main, PR в main, не мержить. По готовности — сообщение product-coord: [PRODUCT] READY WP-WEB-MEMORY-02 :: <sha> :: ref=<PR URL>

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
cd /home/cloudpc/projects/transcriber && claude -w wp-web-memory-02-assignments --model sonnet --name product-web-memory "Прочитай /home/cloudpc/projects/transcriber-orch/docs/orchestration/product/work-packages/WP-WEB-MEMORY-02-assignments.md и выполни. Сначала раздел 0 (подготовка worktree). Ветка feature/wp-web-memory-02-assignments от origin/main, PR в main, не мержить. По готовности — сообщение product-coord: [PRODUCT] READY WP-WEB-MEMORY-02 :: <sha> :: ref=<PR URL>

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
- Пришли `product-coord`: `[PRODUCT] QUESTION WP-WEB-MEMORY-02 :: отказ: <точный текст отказа> :: ref=<команда>`; продолжай работу, которой это не нужно, или жди `ANSWER`.
- Ресурсы по запросу (`graph`, `dev-stack`): перед использованием пришли `product-coord`: `[PRODUCT] LOCK WP-WEB-MEMORY-02 :: <ресурс> :: ref=<зачем>` и жди `ACK`; как только закончишь — `[PRODUCT] UNLOCK WP-WEB-MEMORY-02 :: <ресурс> :: ref=<результат>`. READY возвращает все замки по запросу.

## Пересдачи

<Циклы REVISE: дата, пункты, коммит.>
