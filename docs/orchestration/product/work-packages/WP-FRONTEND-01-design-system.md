# WP-FRONTEND-01 — Дизайн-система ITSALT и каркас приложения

| Поле | Значение |
|------|----------|
| Поток | frontend (area) |
| Репозиторий | . |
| Базовая ветка | main |
| Линия | main |
| Рабочая ветка | `feature/wp-frontend-01-design-system` |
| Worktree | `.claude/worktrees/wp-frontend-01-design-system` (создаёт `claude -w wp-frontend-01-design-system`) |
| Заголовок PR | `[PRODUCT] WP-FRONTEND-01: Дизайн-система ITSALT и каркас приложения` |
| Сессия | `product-frontend` |
| Модель | `sonnet` |
| Усилие | — |
| Почему такая модель | модель реализатора по умолчанию (orch.yaml models.implement) |
| Режим | nacl: `/nacl-tl-dev-fe` (TECH-задача дизайна), `/nacl-tl-review --fe`; граф не трогает |
| Команды методологии: разрешены | nacl: `nacl-tl-dev-fe`, `nacl-tl-fix`, `nacl-tl-review`, `nacl-tl-regression-test`, `nacl-tl-verify-code`, `nacl-tl-sync`, `nacl-tl-docs`, `nacl-tl-stubs`, `nacl-tl-qa`, `nacl-sa-ui`, `nacl-tl-status` |
| Команды методологии: запрещены | `nacl-tl-release`, `nacl-tl-deploy`, `nacl-tl-deliver`, `nacl-tl-hotfix`, `nacl-tl-ship`, `nacl-tl-conductor`, `nacl-tl-full`, `nacl-goal`, `nacl-publish` |
| Разрешённые пути | `web/**` |
| Общие пути, которые трогает пакет | нет (только `web/**`; шрифты — через `@fontsource/*` в `web/package.json` → тогда `web/package.json` и `pnpm-lock.yaml` под замком; допустим вариант без зависимостей — self-host woff2 в `web/public/fonts`) |
| Миграции | нет |
| Ресурсы (замки) | нет |
| Тестовая БД и порты | нет; нет |
| Слот слияния | <место в очереди слияний, задаётся при приёмке> |
| Контракт | нет |
| Зависит от | нет |
| Размер | M |
| Спецификация | нет (визуальное оформление) |
| Граф | нет |
| Решения | D-5 |

Общие пути этого репозитория (объяви те, что трогает пакет): `pnpm-lock.yaml`, `package.json`, `**/package.json`, `shared/**`, `api/prisma/**`, `.tl/**`, `graph-infra/**`, `config.yaml`, `CLAUDE.md`.
Ресурсы этого репозитория, требующие замка: `migrations`, `graph` (по запросу: LOCK/UNLOCK, см. раздел 6), `dev-stack` (по запросу: LOCK/UNLOCK, см. раздел 6).

## 0. Подготовка worktree

1. Переключи worktree на ветку пакета: `git fetch origin && git switch -c feature/wp-frontend-01-design-system origin/main`.
2. Подготовь worktree (команды из `orch.yaml`, выполнять внутри worktree):

   ```bash
   pnpm install --frozen-lockfile
   pnpm --filter @transcrib/api run db:generate
   ```
3. Правь только разрешённые пути; общие пути — только объявленные в шапке и после получения замка.

## 1. Факты

- Дизайн-системы в web нет: Tailwind v4 через `@tailwindcss/vite`, один `@theme` со стоковыми токенами shadcn (`web/src/styles/globals.css:1-40`), без тёмной темы и шрифтов; голый `--radius` в `@theme` не попадает в `--radius-*`, поэтому `rounded-md` берёт встроенный радиус Tailwind.
- Компоненты `web/src/components/ui/`: badge, button, card, dialog, input, progress, select, table, textarea, toast, toaster (shadcn + Radix + cva).
- Нет app shell/layout: маршруты сразу рендерят страницы (`web/src/App.tsx:12-37`).
- Источник дизайна (D-5): `/home/cloudpc/projects/itsalt-site/web/assets/css/tokens.css` (палитра paper-warm #F7F3EA, graphite #161A1D, orange #F4510B/orange-burnt #C84312, petrol #0E4B53, border-paper #E2D8CA; радиусы 10/14/20/pill; тени soft/card/lift; шрифты Inter Tight / Inter / JetBrains Mono), `fonts.css`, `site.css` (кнопки `.btn-primary/.btn-ghost`), правила — `itsalt-site/web/СБОРКА.md` §5, §8; эталон — `_reference.dc.html`.

## 2. Объём

1. Перенести токены ITSALT в `@theme` Tailwind v4: `--color-background/foreground/primary/secondary/muted/accent/destructive/border/input/ring/card/popover` (+ `-foreground`), `--radius-sm/md/lg`, `--font-sans/--font-display/--font-mono`, тени. Primary — orange #F4510B; проверить контраст текста на кнопке (AA), при необходимости foreground white / orange-burnt для hover.
2. Шрифты Inter Tight / Inter / JetBrains Mono (кириллица), self-host или `@fontsource`.
3. Обновить варианты shadcn-компонентов (button, card, input, badge, table, dialog) под ITSALT: радиусы, тени, ghost-кнопка.
4. Каркас приложения `AppShell`: шапка (логотип/название «Transcrib», слот под переключатель пространства и пользователя — пустые заглушки-слоты без логики), контентная колонка; все существующие страницы внутри него. Без логина и без вызовов новых API.
5. Только светлая тема. Мобильная ширина без горизонтального скролла.
6. Не делать: экран входа, переключатель пространства с данными (WP-FRONTEND-02).

### Не входит

- merge, деплой, PROD, запись в БД
- другие модули и рабочее пространство оркестратора
- файлы вне разрешённых путей; общие пути, не объявленные выше
- подъём версий и release notes, если не перечислены выше

## 3. Критерии приёмки

1. `pnpm --filter @transcrib/web test` и `pnpm -r typecheck` зелёные; снапшоты, если есть, обновлены осознанно.
2. В `globals.css` нет стоковых значений shadcn; `rounded-md` у кнопки даёт радиус из токенов ITSALT (проверка вычисленного стиля в тесте или скриншоте).
3. Скриншоты в PR (десктоп 1440 и мобильный 390): каталог, загрузка, встреча, протокол — до/после.
4. Контраст основного текста и текста на primary-кнопке ≥ 4.5:1 (указать значения в PR).

## 4. Порядок сдачи

- PR из `feature/wp-frontend-01-design-system` в `main`; не мержить.
- Тело PR = отчёт разработки + `Deviations` (чем результат отличается от пакета и почему).
- Затем сообщение `product-coord`: `[PRODUCT] READY WP-FRONTEND-01 :: <sha> :: ref=<PR URL>`.

## 5. Start prompt

```text
Прочитай /home/cloudpc/projects/transcriber-orch/docs/orchestration/product/work-packages/WP-FRONTEND-01-design-system.md и выполни. Сначала раздел 0 (подготовка worktree). Ветка feature/wp-frontend-01-design-system от origin/main, PR в main, не мержить. По готовности — сообщение product-coord: [PRODUCT] READY WP-FRONTEND-01 :: <sha> :: ref=<PR URL>

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
cd /home/cloudpc/projects/transcriber-orch && claude -w wp-frontend-01-design-system --model sonnet --name product-frontend "Прочитай /home/cloudpc/projects/transcriber-orch/docs/orchestration/product/work-packages/WP-FRONTEND-01-design-system.md и выполни. Сначала раздел 0 (подготовка worktree). Ветка feature/wp-frontend-01-design-system от origin/main, PR в main, не мержить. По готовности — сообщение product-coord: [PRODUCT] READY WP-FRONTEND-01 :: <sha> :: ref=<PR URL>

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
- Пришли `product-coord`: `[PRODUCT] QUESTION WP-FRONTEND-01 :: отказ: <точный текст отказа> :: ref=<команда>`; продолжай работу, которой это не нужно, или жди `ANSWER`.
- Ресурсы по запросу (`graph`, `dev-stack`): перед использованием пришли `product-coord`: `[PRODUCT] LOCK WP-FRONTEND-01 :: <ресурс> :: ref=<зачем>` и жди `ACK`; как только закончишь — `[PRODUCT] UNLOCK WP-FRONTEND-01 :: <ресурс> :: ref=<результат>`. READY возвращает все замки по запросу.

## Пересдачи

<Циклы REVISE: дата, пункты, коммит.>
