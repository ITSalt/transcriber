# WP-WORKER-07 — Защита протокола от утечки памяти проекта и чужих участников

| Поле | Значение |
|------|----------|
| Поток | worker (area) |
| Репозиторий | /home/cloudpc/projects/transcriber |
| Базовая ветка | main |
| Линия | main |
| Рабочая ветка | `feature/wp-worker-07-memory-leak-guard` |
| Worktree | `.claude/worktrees/wp-worker-07-memory-leak-guard` (создаёт `claude -w wp-worker-07-memory-leak-guard`) |
| Заголовок PR | `[PRODUCT] WP-WORKER-07: Защита протокола от утечки памяти проекта и чужих участников` |
| Сессия | `product-worker` |
| Модель | `sonnet` |
| Усилие | — |
| Почему такая модель | модель реализатора по умолчанию (orch.yaml models.implement) |
| Режим | nacl: `/nacl-tl-fix` (L1: промпт и пост-обработка; поведение описано в заголовке промпта и контракте UC-300) по TDD, `/nacl-tl-review --be` |
| Команды методологии: разрешены | nacl: `nacl-tl-dev-be`, `nacl-tl-dev`, `nacl-tl-fix`, `nacl-tl-review`, `nacl-tl-regression-test`, `nacl-tl-verify-code`, `nacl-tl-sync`, `nacl-tl-docs`, `nacl-tl-stubs`, `nacl-sa-uc`, `nacl-sa-domain`, `nacl-sa-feature`, `nacl-sa-validate`, `nacl-tl-plan`, `nacl-tl-status` |
| Команды методологии: запрещены | `nacl-tl-release`, `nacl-tl-deploy`, `nacl-tl-deliver`, `nacl-tl-hotfix`, `nacl-tl-ship`, `nacl-tl-conductor`, `nacl-tl-full`, `nacl-goal`, `nacl-publish` |
| Разрешённые пути | `worker/{tsconfig.json,vitest.config.ts}`, `worker/test/**`, `worker/src/{asr,jobs,lib,llm}/**`, `worker/src/{config.ts,config.test.ts,logger.ts,shutdown.ts,shutdown.test.ts,job-processor.test.ts,queues.test.ts,queues.regression.test.ts}` |
| Общие пути, которые трогает пакет | нет |
| Миграции | нет |
| Ресурсы (замки) | нет |
| Тестовая БД и порты | нет; нет |
| Слот слияния | <место в очереди слияний, задаётся при приёмке> |
| Контракт | нет (промпт и пост-обработка внутри воркера) |
| Зависит от | нет |
| Размер | S |
| Спецификация | UC-300, RQ-049, RQ-060, FR-006 (память в промпте), DEC-010 (регрессия промпта без контекста байт-в-байт) |
| Граф | нет |
| Решения | D-38, D-11 |

Общие пути этого репозитория (объяви те, что трогает пакет): `pnpm-lock.yaml`, `package.json`, `**/package.json`, `shared/**`, `api/prisma/**`, `.tl/{status.json,master-plan.md,changelog.md,release-status.json,deploy-plan.md}`, `.tl/external-contracts/**`, `graph-infra/**`, `config.yaml`, `CLAUDE.md`, `api/src/server.ts`, `worker/src/index.ts`, `worker/src/job-processor.ts`, `worker/src/queues.ts`, `web/src/App.tsx`, `web/src/i18n/**`.
Ресурсы этого репозитория, требующие замка: `migrations`, `graph` (по запросу: LOCK/UNLOCK, см. раздел 6), `dev-stack` (по запросу: LOCK/UNLOCK, см. раздел 6).

## 0. Подготовка worktree

1. Переключи worktree на ветку пакета: `git fetch origin && git switch -c feature/wp-worker-07-memory-leak-guard origin/main`.
2. Подготовь worktree (команды из `orch.yaml`, выполнять внутри worktree):

   ```bash
   pnpm install --frozen-lockfile
   pnpm --filter @transcrib/api run db:generate
   ```
3. Правь только разрешённые пути; общие пути — только объявленные в шапке и после получения замка.

## 1. Факты

- Находка 3 аналитики (`reports/feedback-analysis-20261008.md` §4): протоколы 12.05 (проходы A и B, `12ced01f…`, `c0063f5d…`) содержат факты встречи TCB от 26.05 из памяти проекта (дедлайн 22 мая, раскатка 5→100 %, backlink, лендинги — в «Обсуждении» и «Решениях») и участников Ильнура/Павла из карточки проекта, которых в транскрипте 12.05 нет (0 вхождений); задачи T-1..T-3 «из предыдущего протокола» выданы как задачи встречи.
- Промпт уже запрещает это словами (`worker/src/llm/prompts/ru/protocol-context.md:36`, `:51`, `:79`, чек-лист `:153`), но модель (`anthropic/claude-haiku-5.5`) нарушает: слов недостаточно, нужна детерминированная защита.
- В промпт попадает `<project_memory>` = сводка + открытые задачи + решения (`worker/src/llm/protocol-context.ts:104-128`, `protocol-context.md:25`), `<previous_protocol>` целиком, `<participants>` — все участники проекта независимо от встречи.
- Регрессионный снапшот промпта без контекста (DEC-010) обязан остаться байт-в-байт.

## 2. Объём

1. Состав `<project_memory>` в промпте: только открытые задачи (код, название, исполнитель, статус) и решения (код, текст) — без сводки; сводка проекта в промпт протокола не подаётся (она остаётся для вкладки «Память»). Сделать это в `ProjectMemoryProvider.getPromptMemory` или в `protocol-context.ts` — выбрать, объяснить в PR; лимит ≲ 5 000 токенов сохраняется.
2. `<participants>` в промпте: оставить всех участников проекта (нужны для написания имён), но в `protocol-context.md` усилить `<speaker_mapping>`/раздел «Участники»: в «## Участники» попадают только те, кто говорит в транскрипте (имя в строке транскрипта или подтверждённая метка) либо назван в транскрипте явно как упоминаемый — отдельной пометкой «упоминается». Обсуждение/Решения/Задачи — только из транскрипта; память и предыдущий протокол — только для `<carried_tasks>` и написания.
3. Детерминированная пост-проверка после LLM (новый `worker/src/llm/protocol-guard.ts`): из «## Участники» удаляются строки с именем, которого нет ни в тексте транскрипта, ни в `speaker_map` (имена сравнивать по первому слову/без падежей — простая нормализация, описать); удалённое — в лог и в `ProtocolGeneration` (поле метаданных или лог) для диагностики. Строки «Speaker N» не трогать.
4. Регрессионная фикстура: транскрипт встречи A + память с фактами встречи B (которых в A нет) + предыдущий протокол B → снапшот промпта содержит память только как список задач/решений; тест пост-проверки на протоколе с «чужим» участником.
5. Не менять: kie.ai/OpenRouter-адаптеры, память проекта (её пайплайн — WP-WORKER-MEMORY-02), регрессию DEC-010.

### Не входит

- merge, деплой, PROD, запись в БД
- другие модули и рабочее пространство оркестратора
- файлы вне разрешённых путей; общие пути, не объявленные выше
- подъём версий и release notes, если не перечислены выше

## 3. Критерии приёмки

1. Снапшот промпта без контекста байт-в-байт прежний; с памятью — `<project_memory>` без сводки (тест).
2. Тест пост-проверки: участник из карточки, отсутствующий в транскрипте, удалён из «## Участники»; участник, названный в транскрипте, оставлен; «Speaker N» нетронуты.
3. Повтор прогона 12.05 на проде после доставки (делает оркестратор): в протоколе нет фактов TCB и нет Ильнура/Павла в участниках — критерий живого сценария.
4. `pnpm -r typecheck`, `pnpm test` зелёные.

## 4. Порядок сдачи

- PR из `feature/wp-worker-07-memory-leak-guard` в `main`; не мержить.
- Тело PR = отчёт разработки + `Deviations` (чем результат отличается от пакета и почему).
- Затем сообщение `product-coord`: `[PRODUCT] READY WP-WORKER-07 :: <sha> :: ref=<PR URL>`.

## 5. Start prompt

```text
Прочитай /home/cloudpc/projects/transcriber-orch/docs/orchestration/product/work-packages/WP-WORKER-07-memory-leak-guard.md и выполни. Сначала раздел 0 (подготовка worktree). Ветка feature/wp-worker-07-memory-leak-guard от origin/main, PR в main, не мержить. По готовности — сообщение product-coord: [PRODUCT] READY WP-WORKER-07 :: <sha> :: ref=<PR URL>

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
cd /home/cloudpc/projects/transcriber && claude -w wp-worker-07-memory-leak-guard --model sonnet --name product-worker "Прочитай /home/cloudpc/projects/transcriber-orch/docs/orchestration/product/work-packages/WP-WORKER-07-memory-leak-guard.md и выполни. Сначала раздел 0 (подготовка worktree). Ветка feature/wp-worker-07-memory-leak-guard от origin/main, PR в main, не мержить. По готовности — сообщение product-coord: [PRODUCT] READY WP-WORKER-07 :: <sha> :: ref=<PR URL>

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
- Пришли `product-coord`: `[PRODUCT] QUESTION WP-WORKER-07 :: отказ: <точный текст отказа> :: ref=<команда>`; продолжай работу, которой это не нужно, или жди `ANSWER`.
- Ресурсы по запросу (`graph`, `dev-stack`): перед использованием пришли `product-coord`: `[PRODUCT] LOCK WP-WORKER-07 :: <ресурс> :: ref=<зачем>` и жди `ACK`; как только закончишь — `[PRODUCT] UNLOCK WP-WORKER-07 :: <ресурс> :: ref=<результат>`. READY возвращает все замки по запросу.

## Пересдачи

<Циклы REVISE: дата, пункты, коммит.>
