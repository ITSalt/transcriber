# WP-WEB-PROJECTS-01 — Проекты и форма контекста перед распознаванием

| Поле | Значение |
|------|----------|
| Поток | web-projects (area) |
| Репозиторий | . |
| Базовая ветка | main |
| Линия | main |
| Рабочая ветка | `feature/wp-web-projects-01-projects-context` |
| Worktree | `.claude/worktrees/wp-web-projects-01-projects-context` (создаёт `claude -w wp-web-projects-01-projects-context`) |
| Заголовок PR | `[PRODUCT] WP-WEB-PROJECTS-01: Проекты и форма контекста перед распознаванием` |
| Сессия | `product-web-projects` |
| Модель | `sonnet` |
| Усилие | — |
| Почему такая модель | модель реализатора по умолчанию (orch.yaml models.implement) |
| Режим | nacl: `/nacl-tl-dev-fe` по TDD, `/nacl-tl-sync`, `/nacl-tl-review --fe` |
| Команды методологии: разрешены | nacl: `nacl-tl-dev-fe`, `nacl-tl-fix`, `nacl-tl-review`, `nacl-tl-regression-test`, `nacl-tl-verify-code`, `nacl-tl-sync`, `nacl-tl-docs`, `nacl-tl-stubs`, `nacl-tl-qa`, `nacl-sa-ui`, `nacl-tl-status` |
| Команды методологии: запрещены | `nacl-tl-release`, `nacl-tl-deploy`, `nacl-tl-deliver`, `nacl-tl-hotfix`, `nacl-tl-ship`, `nacl-tl-conductor`, `nacl-tl-full`, `nacl-goal`, `nacl-publish` |
| Разрешённые пути | `web/src/routes/upload/**`, `web/src/features/{projects,context}/**` |
| Общие пути, которые трогает пакет | нет (фича подключается автоматически через index.ts своей папки и слоты AppShell из WP-FRONTEND-01) |
| Миграции | нет |
| Ресурсы (замки) | `dev-stack` по запросу |
| Тестовая БД и порты | нет; нет |
| Слот слияния | <место в очереди слияний, задаётся при приёмке> |
| Контракт | shared project/context v1 из WP-BACKEND-06 |
| Зависит от | WP-FRONTEND-01, WP-BACKEND-06 (в main). Слот слияния: после WP-API-PROJECTS-01 и WP-WORKER-01 |
| Размер | L |
| Спецификация | UC-100 (изменённый), FR-004 |
| Граф | при необходимости `/nacl-sa-ui` под замком `graph` |
| Решения | D-5, D-9, D-10, D-15 |

Общие пути этого репозитория (объяви те, что трогает пакет): `pnpm-lock.yaml`, `package.json`, `**/package.json`, `shared/**`, `api/prisma/**`, `.tl/**`, `graph-infra/**`, `config.yaml`, `CLAUDE.md`, `api/src/server.ts`, `worker/src/index.ts`, `worker/src/job-processor.ts`, `worker/src/queues.ts`, `web/src/App.tsx`, `web/src/i18n/**`.
Ресурсы этого репозитория, требующие замка: `migrations`, `graph` (по запросу: LOCK/UNLOCK, см. раздел 6), `dev-stack` (по запросу: LOCK/UNLOCK, см. раздел 6).

## 0. Подготовка worktree

1. Переключи worktree на ветку пакета: `git fetch origin && git switch -c feature/wp-web-projects-01-projects-context origin/main`.
2. Подготовь worktree (команды из `orch.yaml`, выполнять внутри worktree):

   ```bash
   pnpm install --frozen-lockfile
   pnpm --filter @transcrib/api run db:generate
   ```
3. Правь только разрешённые пути; общие пути — только объявленные в шапке и после получения замка.

## 1. Факты

- Экран загрузки `/upload` сейчас сразу ведёт к распознаванию; формы контекста нет (`web/src/App.tsx:12-37`).
- Компоненты форм: input, textarea, select, dialog в `web/src/components/ui/` (после FRONTEND-01 — в стиле ITSALT).
- Контекст для LLM полезен в порядке: участники с ролями/сторонами, тип и цель, повестка, глоссарий, открытые задачи прошлого протокола (исследование 2026-10-07; у Otter/Fireflies/Zoom/Fathom/Krisp — словарь и шаблоны на уровне workspace/канала).
- Экран загрузки — `web/src/routes/upload/**` (путь этого потока); раздел проектов — `web/src/features/projects/**`, форма контекста — `web/src/features/context/**`.

## 2. Объём

1. Раздел «Проекты» в пространстве: список, создание, карточка (описание, участники: имя/варианты написания/роль/организация/сторона; глоссарий: термин/варианты/пояснение/флаг «для распознавания»).
2. Экран загрузки (D-9): выбор проекта (необязательно) → подставляются участники и глоссарий проекта (только чтение, с пометкой «из проекта») + блок «дополнения к этой встрече»: тип встречи, цель, повестка, доп. участники, доп. термины, предыдущий протокол (по умолчанию последний протокол проекта, можно заменить вставкой текста/загрузкой .md/.txt или убрать), заметки. Кнопка «Добавить в проект» у доп. участника/термина. Загрузка завершается с `deferStart: true`; кнопка «Начать распознавание» (`POST /start`) активна после загрузки файла.
3. В карточке задачи — просмотр использованного контекста (снимок).
4. Подсказка про лимит: в распознавание идут до 50 имён/терминов, остальное — только в протокол.
5. Не делать: редактирование контекста после старта.

### Не входит

- merge, деплой, PROD, запись в БД
- другие модули и рабочее пространство оркестратора
- файлы вне разрешённых путей; общие пути, не объявленные выше
- подъём версий и release notes, если не перечислены выше

## 3. Критерии приёмки

1. Тесты web: подстановка проекта, дополнения не меняют проект без явной кнопки, старт после загрузки, пропуск контекста.
2. `/nacl-tl-sync` без расхождений; typecheck и тесты зелёные.
3. Локальный E2E: проект с 3 участниками → задача → снимок контекста виден в карточке; скриншоты в PR.
4. Тесты с моками ответов API по Zod-схемам контракта; если API-пакет ещё не в main — локальный E2E на его ветке или пометка «E2E после merge API», тогда сценарий проходит оркестратор при доставке.

## 4. Порядок сдачи

- PR из `feature/wp-web-projects-01-projects-context` в `main`; не мержить.
- Тело PR = отчёт разработки + `Deviations` (чем результат отличается от пакета и почему).
- Затем сообщение `product-coord`: `[PRODUCT] READY WP-WEB-PROJECTS-01 :: <sha> :: ref=<PR URL>`.

## 5. Start prompt

```text
Прочитай /home/cloudpc/projects/transcriber-orch/docs/orchestration/product/work-packages/WP-WEB-PROJECTS-01-projects-context.md и выполни. Сначала раздел 0 (подготовка worktree). Ветка feature/wp-web-projects-01-projects-context от origin/main, PR в main, не мержить. По готовности — сообщение product-coord: [PRODUCT] READY WP-WEB-PROJECTS-01 :: <sha> :: ref=<PR URL>

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
cd /home/cloudpc/projects/transcriber && claude -w wp-web-projects-01-projects-context --model sonnet --name product-web-projects "Прочитай /home/cloudpc/projects/transcriber-orch/docs/orchestration/product/work-packages/WP-WEB-PROJECTS-01-projects-context.md и выполни. Сначала раздел 0 (подготовка worktree). Ветка feature/wp-web-projects-01-projects-context от origin/main, PR в main, не мержить. По готовности — сообщение product-coord: [PRODUCT] READY WP-WEB-PROJECTS-01 :: <sha> :: ref=<PR URL>

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
- Пришли `product-coord`: `[PRODUCT] QUESTION WP-WEB-PROJECTS-01 :: отказ: <точный текст отказа> :: ref=<команда>`; продолжай работу, которой это не нужно, или жди `ANSWER`.
- Ресурсы по запросу (`graph`, `dev-stack`): перед использованием пришли `product-coord`: `[PRODUCT] LOCK WP-WEB-PROJECTS-01 :: <ресурс> :: ref=<зачем>` и жди `ACK`; как только закончишь — `[PRODUCT] UNLOCK WP-WEB-PROJECTS-01 :: <ресурс> :: ref=<результат>`. READY возвращает все замки по запросу.

## Пересдачи

<Циклы REVISE: дата, пункты, коммит.>
