# WP-FRONTEND-05 — Реестр задач и решений проекта, очередь подтверждений

| Поле | Значение |
|------|----------|
| Поток | frontend (area) |
| Репозиторий | . |
| Базовая ветка | main |
| Линия | main |
| Рабочая ветка | `feature/wp-frontend-05-project-memory-ui` |
| Worktree | `.claude/worktrees/wp-frontend-05-project-memory-ui` (создаёт `claude -w wp-frontend-05-project-memory-ui`) |
| Заголовок PR | `[PRODUCT] WP-FRONTEND-05: Реестр задач и решений проекта, очередь подтверждений` |
| Сессия | `product-frontend` |
| Модель | `sonnet` |
| Усилие | — |
| Почему такая модель | модель реализатора по умолчанию (orch.yaml models.implement) |
| Режим | nacl: `/nacl-tl-dev-fe` по TDD, `/nacl-tl-sync`, `/nacl-tl-review --fe` |
| Команды методологии: разрешены | nacl: `nacl-tl-dev-fe`, `nacl-tl-fix`, `nacl-tl-review`, `nacl-tl-regression-test`, `nacl-tl-verify-code`, `nacl-tl-sync`, `nacl-tl-docs`, `nacl-tl-stubs`, `nacl-tl-qa`, `nacl-sa-ui`, `nacl-tl-status` |
| Команды методологии: запрещены | `nacl-tl-release`, `nacl-tl-deploy`, `nacl-tl-deliver`, `nacl-tl-hotfix`, `nacl-tl-ship`, `nacl-tl-conductor`, `nacl-tl-full`, `nacl-goal`, `nacl-publish` |
| Разрешённые пути | `web/**` |
| Общие пути, которые трогает пакет | нет |
| Миграции | нет |
| Ресурсы (замки) | `dev-stack` по запросу |
| Тестовая БД и порты | нет; нет |
| Слот слияния | <место в очереди слияний, задаётся при приёмке> |
| Контракт | shared project-memory v1 из WP-BACKEND-04 |
| Зависит от | WP-BACKEND-04, WP-FRONTEND-03 |
| Размер | M |
| Спецификация | FR-006 |
| Граф | при необходимости `/nacl-sa-ui` под замком `graph` |
| Решения | D-5, D-11; P-12 — ждёт ответа |

Общие пути этого репозитория (объяви те, что трогает пакет): `pnpm-lock.yaml`, `package.json`, `**/package.json`, `shared/**`, `api/prisma/**`, `.tl/**`, `graph-infra/**`, `config.yaml`, `CLAUDE.md`.
Ресурсы этого репозитория, требующие замка: `migrations`, `graph` (по запросу: LOCK/UNLOCK, см. раздел 6), `dev-stack` (по запросу: LOCK/UNLOCK, см. раздел 6).

## 0. Подготовка worktree

1. Переключи worktree на ветку пакета: `git fetch origin && git switch -c feature/wp-frontend-05-project-memory-ui origin/main`.
2. Подготовь worktree (команды из `orch.yaml`, выполнять внутри worktree):

   ```bash
   pnpm install --frozen-lockfile
   pnpm --filter @transcrib/api run db:generate
   ```
3. Правь только разрешённые пути; общие пути — только объявленные в шапке и после получения замка.

## 1. Факты

- Карточка проекта появляется в WP-FRONTEND-03; реестра задач и решений в UI нет.
- По исследованию Q-3 подтверждение человеком закрытий и слияний — норма рынка и источник обратной связи.

## 2. Объём

1. В проекте вкладки «Задачи» (фильтр по статусу и исполнителю; у задачи — история: в какой встрече создана, упоминания с цитатой и переходом к таймкоду транскрипта, журнал изменений), «Решения», «Сводка» (текущая версия + история версий).
2. «На подтверждение» (по P-12): список PENDING-изменений с цитатой, было → стало, кнопки «Подтвердить»/«Отклонить»; счётчик в шапке проекта.
3. Ручная правка задачи: статус, исполнитель, срок (событие source=USER).
4. На странице протокола — ссылки на коды T-n/D-n, упомянутые в нём.
5. Не делать: визуализацию графа, drag-and-drop канбан.

### Не входит

- merge, деплой, PROD, запись в БД
- другие модули и рабочее пространство оркестратора
- файлы вне разрешённых путей; общие пути, не объявленные выше
- подъём версий и release notes, если не перечислены выше

## 3. Критерии приёмки

1. Тесты web: фильтры, история задачи, подтверждение/отклонение, ручная правка.
2. `/nacl-tl-sync` без расхождений; typecheck и тесты зелёные.
3. Локальный E2E: две встречи проекта → задача перенесена, закрытие подтверждено; скриншоты в PR.

## 4. Порядок сдачи

- PR из `feature/wp-frontend-05-project-memory-ui` в `main`; не мержить.
- Тело PR = отчёт разработки + `Deviations` (чем результат отличается от пакета и почему).
- Затем сообщение `product-coord`: `[PRODUCT] READY WP-FRONTEND-05 :: <sha> :: ref=<PR URL>`.

## 5. Start prompt

```text
Прочитай /home/cloudpc/projects/transcriber-orch/docs/orchestration/product/work-packages/WP-FRONTEND-05-project-memory-ui.md и выполни. Сначала раздел 0 (подготовка worktree). Ветка feature/wp-frontend-05-project-memory-ui от origin/main, PR в main, не мержить. По готовности — сообщение product-coord: [PRODUCT] READY WP-FRONTEND-05 :: <sha> :: ref=<PR URL>

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
cd /home/cloudpc/projects/transcriber-orch && claude -w wp-frontend-05-project-memory-ui --model sonnet --name product-frontend "Прочитай /home/cloudpc/projects/transcriber-orch/docs/orchestration/product/work-packages/WP-FRONTEND-05-project-memory-ui.md и выполни. Сначала раздел 0 (подготовка worktree). Ветка feature/wp-frontend-05-project-memory-ui от origin/main, PR в main, не мержить. По готовности — сообщение product-coord: [PRODUCT] READY WP-FRONTEND-05 :: <sha> :: ref=<PR URL>

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
- Пришли `product-coord`: `[PRODUCT] QUESTION WP-FRONTEND-05 :: отказ: <точный текст отказа> :: ref=<команда>`; продолжай работу, которой это не нужно, или жди `ANSWER`.
- Ресурсы по запросу (`graph`, `dev-stack`): перед использованием пришли `product-coord`: `[PRODUCT] LOCK WP-FRONTEND-05 :: <ресурс> :: ref=<зачем>` и жди `ACK`; как только закончишь — `[PRODUCT] UNLOCK WP-FRONTEND-05 :: <ресурс> :: ref=<результат>`. READY возвращает все замки по запросу.

## Пересдачи

<Циклы REVISE: дата, пункты, коммит.>
