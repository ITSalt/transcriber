# WP-SPEC-01 — Глоссарий графа: UTF-8, русские названия, термины программы, подписи форм

| Поле | Значение |
|------|----------|
| Поток | spec (area) |
| Репозиторий | /home/cloudpc/projects/transcriber |
| Базовая ветка | main |
| Линия | main |
| Рабочая ветка | `feature/wp-spec-01-glossary` |
| Worktree | `.claude/worktrees/wp-spec-01-glossary` (создаёт `claude -w wp-spec-01-glossary`) |
| Заголовок PR | `[PRODUCT] WP-SPEC-01: Глоссарий графа: UTF-8, русские названия, термины программы, подписи форм` |
| Сессия | `product-spec` |
| Модель | `sonnet` |
| Усилие | — |
| Почему такая модель | модель реализатора по умолчанию (orch.yaml models.implement) |
| Режим | nacl, только спецификация: `/nacl-ba-glossary` (термины), `/nacl-sa-ui` (подписи форм), `/nacl-sa-uc` (user story UC-400/402), `/nacl-render` (экспорт) под замком `graph`; код приложения не трогать |
| Команды методологии: разрешены | nacl: `nacl-ba-glossary`, `nacl-ba-validate`, `nacl-sa-ui`, `nacl-sa-uc`, `nacl-sa-validate`, `nacl-render`, `nacl-tl-docs`, `nacl-tl-status` |
| Команды методологии: запрещены | `nacl-tl-release`, `nacl-tl-deploy`, `nacl-tl-deliver`, `nacl-tl-hotfix`, `nacl-tl-ship`, `nacl-tl-conductor`, `nacl-tl-full`, `nacl-goal`, `nacl-publish`, `nacl-tl-dev-be`, `nacl-tl-dev-fe`, `nacl-tl-dev`, `nacl-tl-fix` |
| Разрешённые пути | `graph-infra/**`, `.tl/**`, `CLAUDE.md` |
| Общие пути, которые трогает пакет | `graph-infra/**` (посевной файл глоссария, экспорт), `.tl/external-contracts/**` только если `/nacl-render` их перегенерирует, `CLAUDE.md` (строка LLM) |
| Миграции | нет |
| Ресурсы (замки) | `graph` по запросу (LOCK graph до первой записи в Neo4j, UNLOCK после экспорта) |
| Тестовая БД и порты | нет; нет |
| Слот слияния | <место в очереди слияний, задаётся при приёмке> |
| Контракт | нет |
| Зависит от | нет |
| Размер | M |
| Спецификация | GLO-001…028, ent-007…023, UC-400, UC-402, FORM-MeetingCatalog, FORM-MeetingDetail, FORM-MeetingUpload |
| Граф | `:GlossaryTerm` (перезаливка + новые термины), `:UseCase` UC-400/UC-402 `user_story`, `:Form` подписи; экспорт `graph-infra/exports/transcrib-graph-export.cypher` |
| Решения | D-40, D-41, D-42, D-43, D-44 |

Общие пути этого репозитория (объяви те, что трогает пакет): `pnpm-lock.yaml`, `package.json`, `**/package.json`, `shared/**`, `api/prisma/**`, `.tl/{status.json,master-plan.md,changelog.md,release-status.json,deploy-plan.md}`, `.tl/external-contracts/**`, `graph-infra/**`, `config.yaml`, `CLAUDE.md`, `api/src/server.ts`, `worker/src/index.ts`, `worker/src/job-processor.ts`, `worker/src/queues.ts`, `web/src/App.tsx`, `web/src/i18n/**`.
Ресурсы этого репозитория, требующие замка: `migrations`, `graph` (по запросу: LOCK/UNLOCK, см. раздел 6), `dev-stack` (по запросу: LOCK/UNLOCK, см. раздел 6).

## 0. Подготовка worktree

1. Переключи worktree на ветку пакета: `git fetch origin && git switch -c feature/wp-spec-01-glossary origin/main`.
2. Подготовь worktree (команды из `orch.yaml`, выполнять внутри worktree):

   ```bash
   pnpm install --frozen-lockfile
   pnpm --filter @transcrib/api run db:generate
   ```
3. Правь только разрешённые пути; общие пути — только объявленные в шапке и после получения замка.

## 1. Факты

- Ревизия терминологии 2026-10-09 (`reports/terminology-audit-20261009.md`): владелец отменил A-2 («задача в UI = Meeting»). Словарь: «встреча» — то, что загружаем (Meeting); «поручение» — задание участнику встречи с контекстом и сроком (реестр проекта T-n, секция протокола); слово «задача» в продукте не используется ни в одном значении; фоновые работы — «обработка»; метка неподтверждённого спикера — «Спикер N» как в транскрипте (D-40, D-41, D-42). Идентификаторы кода (`Task`, `/api/projects/:id/tasks`, `T-n`, `SPEAKER_n`) не меняются.
- Код уже говорит правильно: `Meeting`/`/api/meetings`, `/api/projects/:projectId/tasks`, секции протокола `['## Участники','## Обсуждение','## Решения','## Задачи']` (`worker/src/jobs/protocol-generation.ts:85`). Расхождение живёт в строках интерфейса, промптах, тестах и графе спецификации.
- Граф `codex-transcriber-knowledge-neo4j` (bolt 3627; `.mcp.json`): 28 терминов `GLO-001…028`, все `status: draft`, `created: 2026-05-17`; `name` только английский. Русские синонимы испорчены при загрузке: `MATCH (t:GlossaryTerm {id:'GLO-001'}) RETURN t.aliases[0], size(t.aliases[0])` → `"??????????????", 14` (должно быть «Встреча», 7); в `definition` GLO-016/017/024 тире заменено на «???». Посевной файл `graph-infra/seeds/ba-glossary-seed.cypher:20` корректен (`aliases = ['Встреча', 'Session']`). Причина — загрузка без UTF-8; `cypher-shell` в контейнере печатает кириллицу только с `LANG=C.UTF-8`.
- Нет терминов трёх последних программ (ent-008 Workspace, ent-012 Project, ent-013 ProjectParticipant, ent-014 GlossaryTerm проекта, ent-015 MeetingContext, ent-016 ProtocolGeneration, ent-017 ProtocolVersion, ent-018 ProtocolFeedback, ent-020 Task, ent-021 Decision, ent-022 TaskEvent, ent-023 ProjectMemory; UC-505 подтверждение спикеров; keyterm).
- Перекрёстные синонимы: GLO-011 Participant ↔ «Speaker»; GLO-027 User ↔ «Meeting Participant»; GLO-001 Meeting ↔ «Session» (конфликт с ent-010 AuthSession); GLO-018…020 job'ы — «фоновая задача» (третье значение слова); GLO-007 дублирует GLO-006; GLO-012/013 Author/Reviewer и GLO-027 описывают MVP до FR-003.
- `UC-400.user_story`: «…чтобы работать со своими задачами»; `UC-402.user_story`: «…вижу только его задачи (встречи) и проекты». `FORM-MeetingCatalog.name` = «Meeting catalog».
- `CLAUDE.md` раздел Stack: «LLM: kie.ai — Claude Sonnet 4.6…», на проде `LLM_PROVIDER=openrouter`, модель `anthropic/claude-haiku-5.5` через исходящий прокси (D-33, D-34, D-35).

## 2. Объём

1. Перезалить все 28 терминов из посевного файла в UTF-8 (через `/nacl-ba-glossary`; при прямой загрузке — `cypher-shell` с `LANG=C.UTF-8`/`--encoding utf-8`); проверка после: `size(t.aliases[0])` = 7 для GLO-001, в `definition` нет «???».
2. Русские названия: поле `name_ru` у каждого термина (или RU как `name`, EN в `aliases` — по правилу `/nacl-ba-glossary`); единый язык названий UC (UC-001…302 сейчас на английском, UC-303+ на русском) — решить по правилу методологии и применить.
3. Новые термины по словарю отчёта (раздел 2): Пространство, Членство, Проект, Участник проекта, Термин проекта (данные продукта — отличать от глоссария спецификации), Контекст встречи, Снимок контекста, Запуск распознавания (AWAITING_START), Подтверждение спикеров (AWAITING_SPEAKERS), Спикер (метка диаризации «Спикер N»), Ключевой термин (keyterm), Поручение (= GLO-008, переименовать; реестр T-n, статусы, исполнитель, срок; `DEFINES_TERM` → ent-020), Решение проекта (D-n, ent-021), Событие поручения (ent-022), Очередь подтверждения, Память проекта, Версия протокола, Обратная связь на протокол, GraphOutbox; «Обработка» для фоновых работ (GLO-018…020 — синонимы без слова «задача»).
4. Правки: убрать «Speaker» из GLO-011 и «Meeting Participant» из GLO-027; убрать «Session» из GLO-001; слить GLO-007 в GLO-006; роли GLO-012/013 и GLO-027 переписать по FR-003 (пользователь пространства, член, оператор CLI SR-03); все термины `status: approved`, `updated` = дата правки.
5. `UC-400`/`UC-402` user_story: «встречи» вместо «задачи»; `FORM-MeetingCatalog` — подпись «Встречи» (список встреч), подписи форм по новым строкам (отчёт 4.1–4.3: «Записи», «Сведения», статусы в женском роде).
6. `/nacl-render` → обновить `graph-infra/exports/**`; посевной файл глоссария синхронизировать с графом (новые термины тоже в seed).
7. `CLAUDE.md`: строка LLM — фактический провайдер и модель с прода (OpenRouter `anthropic/claude-haiku-5.5` через `OUTBOUND_PROXY_URL`; kie.ai — резерв).

### Не входит

- merge, деплой, PROD, запись в БД
- другие модули и рабочее пространство оркестратора
- файлы вне разрешённых путей; общие пути, не объявленные выше
- подъём версий и release notes, если не перечислены выше

## 3. Критерии приёмки

1. Запрос к графу (оркестратор, read-only): `MATCH (t:GlossaryTerm) RETURN count(t), sum(CASE WHEN t.status='approved' THEN 1 ELSE 0 END)` — все approved; `size(aliases[0])` GLO-001 = 7; `MATCH (t:GlossaryTerm) WHERE any(a IN t.aliases WHERE a CONTAINS '?') RETURN count(t)` = 0.
2. Есть термины «Поручение», «Пространство», «Проект», «Спикер», «Контекст встречи», «Память проекта», «Обратная связь» (поиск по `name`/`name_ru`); у GLO-011 нет синонима «Speaker», у GLO-001 нет «Session».
3. `UC-400`/`UC-402` user_story без слова «задач»; `FORM-MeetingCatalog` подпись «Встречи».
4. `/nacl-ba-validate` без CRITICAL по глоссарию; экспорт в `graph-infra/exports` и seed в PR совпадают с графом (выборочная проверка 3 терминов).
5. `CLAUDE.md` называет OpenRouter и `anthropic/claude-haiku-5.5`; `pnpm -r typecheck` зелёный (PR без кода).

## 4. Порядок сдачи

- PR из `feature/wp-spec-01-glossary` в `main`; не мержить.
- Тело PR = отчёт разработки + `Deviations` (чем результат отличается от пакета и почему).
- Затем сообщение `product-coord`: `[PRODUCT] READY WP-SPEC-01 :: <sha> :: ref=<PR URL>`.

## 5. Start prompt

```text
Прочитай /home/cloudpc/projects/transcriber-orch/docs/orchestration/product/work-packages/WP-SPEC-01-glossary.md и выполни. Сначала раздел 0 (подготовка worktree). Ветка feature/wp-spec-01-glossary от origin/main, PR в main, не мержить. По готовности — сообщение product-coord: [PRODUCT] READY WP-SPEC-01 :: <sha> :: ref=<PR URL>

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
cd /home/cloudpc/projects/transcriber && claude -w wp-spec-01-glossary --model sonnet --name product-spec "Прочитай /home/cloudpc/projects/transcriber-orch/docs/orchestration/product/work-packages/WP-SPEC-01-glossary.md и выполни. Сначала раздел 0 (подготовка worktree). Ветка feature/wp-spec-01-glossary от origin/main, PR в main, не мержить. По готовности — сообщение product-coord: [PRODUCT] READY WP-SPEC-01 :: <sha> :: ref=<PR URL>

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
- Пришли `product-coord`: `[PRODUCT] QUESTION WP-SPEC-01 :: отказ: <точный текст отказа> :: ref=<команда>`; продолжай работу, которой это не нужно, или жди `ANSWER`.
- Ресурсы по запросу (`graph`, `dev-stack`): перед использованием пришли `product-coord`: `[PRODUCT] LOCK WP-SPEC-01 :: <ресурс> :: ref=<зачем>` и жди `ACK`; как только закончишь — `[PRODUCT] UNLOCK WP-SPEC-01 :: <ресурс> :: ref=<результат>`. READY возвращает все замки по запросу.

## Пересдачи

<Циклы REVISE: дата, пункты, коммит.>
