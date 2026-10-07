# Модернизация Transcrib до продукта — статус

Единственный источник состояния программы `product`. Пишет только оркестратор —
через `orch.py` и точечные правки, после каждого изменения состояния.

## Волны

| Волна | Цель | Гейт | Статус |
|-------|------|------|--------|
| 1 (сейчас, 3 сессии параллельно) | Контракт программы (BACKEND-06); дизайн ITSALT + автоподключение фич (FRONTEND-01); Neo4j-инфраструктура (INFRA-01) | BACKEND-06: миграция с бэкфиллами зелёная, старый код работает на новой схеме, контракты всех фич в shared; FRONTEND-01: тест автоподключения; INFRA-01: сервис и CI | READY |
| 2 (после merge BACKEND-06 и FRONTEND-01; до 7 сессий) | Вход и изоляция (BACKEND-01); экран входа и задачи (FRONTEND-02); контекст в Deepgram/LLM (WORKER-01); память в Neo4j (WORKER-MEMORY-01); UI проектов, отзывов, реестра (WEB-PROJECTS-01, WEB-FEEDBACK-01, WEB-MEMORY-01) против контракта | тест изоляции по всем маршрутам; регрессия промпта без контекста байт-в-байт; фикстура двух встреч памяти | READY |
| 3 (после merge BACKEND-01; 3 сессии) | API проектов/запуска (API-PROJECTS-01), отзывов (API-FEEDBACK-01), памяти (API-MEMORY-01, ещё после WORKER-MEMORY-01) | тест изоляции покрывает новые маршруты | READY |
| Доставка (по одному, merge = прод) | BACKEND-06 → INFRA-01 → FRONTEND-01 → [BACKEND-01 + FRONTEND-02 подряд] → WORKER-01 → API-PROJECTS-01 → WEB-PROJECTS-01 → API-FEEDBACK-01 → WEB-FEEDBACK-01 → WORKER-MEMORY-01 (Neo4j на VM запущен владельцем) → API-MEMORY-01 → WEB-MEMORY-01 | после каждого — verify --env prod; перед пакетами с миграцией — бэкап БД (D-4) | — |

## Пакеты работ

Статусы: DRAFT, READY, DISPATCHING, IN_PROGRESS, REVIEW, REVISE, ACCEPTED, MERGED,
TEST-APPLIED / DEPLOYED_TEST, VERIFYING, PROD, DONE, BLOCKED (причина),
CANCELLED (причина).

<!-- orch:wp -->
| WP | Модуль | Название | Статус | Сессия | PR | Обновлено |
|----|--------|----------|--------|--------|----|-----------|
| [WP-BACKEND-01](work-packages/WP-BACKEND-01-auth-workspaces.md) | backend | Вход по PIN, рабочие пространства и изоляция данных (API+worker) | READY | product-backend | — | 2026-10-07 |
| [WP-FRONTEND-01](work-packages/WP-FRONTEND-01-design-system.md) | frontend | Дизайн-система ITSALT и каркас приложения | PROD | product-frontend | https://github.com/ITSalt/transcriber/pull/9 (accepted 364b6b9fb8) | 2026-10-07 |
| [WP-FRONTEND-02](work-packages/WP-FRONTEND-02-login-tasks.md) | frontend | Экран входа, переключатель пространств, список задач | READY | product-frontend | — | 2026-10-07 |
| [WP-BACKEND-02](work-packages/WP-BACKEND-02-projects-context.md) | backend | Проекты и контекст встречи: в распознавание и в протокол | CANCELLED (заменён WP-API-PROJECTS-01 (D-15, поток api-projects)) | product-backend | — | 2026-10-07 |
| [WP-FRONTEND-03](work-packages/WP-FRONTEND-03-projects-context-ui.md) | frontend | Проекты и форма контекста перед распознаванием | CANCELLED (заменён WP-WEB-PROJECTS-01 (D-15)) | product-frontend | — | 2026-10-07 |
| [WP-BACKEND-03](work-packages/WP-BACKEND-03-feedback.md) | backend | История версий протокола и приём обратной связи | CANCELLED (заменён WP-API-FEEDBACK-01 (D-15, поток api-feedback)) | product-backend | — | 2026-10-07 |
| [WP-FRONTEND-04](work-packages/WP-FRONTEND-04-feedback-ui.md) | frontend | Режим обратной связи по протоколу | CANCELLED (заменён WP-WEB-FEEDBACK-01 (D-15)) | product-frontend | — | 2026-10-07 |
| [WP-BACKEND-04](work-packages/WP-BACKEND-04-project-memory.md) | backend | Память проекта: граф задач и решений, сводка, перенос между встречами | CANCELLED (заменён WP-API-MEMORY-01 (D-15, поток api-memory)) | product-backend | — | 2026-10-07 |
| [WP-FRONTEND-05](work-packages/WP-FRONTEND-05-project-memory-ui.md) | frontend | Реестр задач и решений проекта, очередь подтверждений | CANCELLED (заменён WP-WEB-MEMORY-01 (D-15)) | product-frontend | — | 2026-10-07 |
| [WP-BACKEND-05](work-packages/WP-BACKEND-05-neo4j-prod.md) | backend | Neo4j для памяти проекта: сервис, лимиты памяти, бэкап, CI | CANCELLED (заменён WP-INFRA-01 и WP-WORKER-MEMORY-01 (D-15)) | product-backend | — | 2026-10-07 |
| [WP-BACKEND-06](work-packages/WP-BACKEND-06-contract.md) | backend | Контракт программы: схема БД, контракты shared, зависимости | REVIEW | product-backend | https://github.com/ITSalt/transcriber/pull/12 | 2026-10-07 |
| [WP-WORKER-01](work-packages/WP-WORKER-01-context-asr-llm.md) | worker | Контекст встречи в Deepgram и в промпт протокола, метаданные генерации | READY | product-worker | — | 2026-10-07 |
| [WP-WORKER-02](work-packages/WP-WORKER-02-project-memory.md) | worker | Память проекта в Neo4j: извлечение, сопоставление, сводка | CANCELLED (создан в неверном потоке; заменён WP-WORKER-MEMORY-01 (D-15)) | product-worker | — | 2026-10-07 |
| [WP-INFRA-01](work-packages/WP-INFRA-01-neo4j.md) | infra | Neo4j памяти проекта: сервис, лимиты, бэкап, CI, шаг деплоя | PROD | product-infra | https://github.com/ITSalt/transcriber/pull/10 (accepted 0e7ebe85d3) | 2026-10-07 |
| [WP-WEB-PROJECTS-01](work-packages/WP-WEB-PROJECTS-01-projects-context.md) | web-projects | Проекты и форма контекста перед распознаванием | READY | product-web-projects | — | 2026-10-07 |
| [WP-WEB-FEEDBACK-01](work-packages/WP-WEB-FEEDBACK-01-feedback.md) | web-feedback | Режим обратной связи по протоколу | READY | product-web-feedback | — | 2026-10-07 |
| [WP-WEB-MEMORY-01](work-packages/WP-WEB-MEMORY-01-registry.md) | web-memory | Реестр задач и решений проекта, очередь подтверждений | READY | product-web-memory | — | 2026-10-07 |
| [WP-API-PROJECTS-01](work-packages/WP-API-PROJECTS-01-projects-context.md) | api-projects | API проектов и контекста встречи, запуск распознавания | READY | product-api-projects | — | 2026-10-07 |
| [WP-API-FEEDBACK-01](work-packages/WP-API-FEEDBACK-01-feedback.md) | api-feedback | API версий протокола и обратной связи, разбор docx | READY | product-api-feedback | — | 2026-10-07 |
| [WP-API-MEMORY-01](work-packages/WP-API-MEMORY-01-registry.md) | api-memory | API памяти проекта: задачи, решения, подтверждения | READY | product-api-memory | — | 2026-10-07 |
| [WP-WORKER-MEMORY-01](work-packages/WP-WORKER-MEMORY-01-pipeline.md) | worker-memory | Память проекта в Neo4j: слой графа, извлечение, сопоставление, сводка | READY | product-worker-memory | — | 2026-10-07 |
| [WP-INFRA-02](work-packages/WP-INFRA-02-deploy-migrate-first.md) | infra | Порядок деплоя: миграции Postgres до сборки и замены dist | PROD | product-infra | https://github.com/ITSalt/transcriber/pull/11 (accepted 6694e5e172) | 2026-10-07 |

## Ждёт владельца

R-n — действие: точная команда одной строкой и ожидаемый вывод. P-n — вопрос:
варианты с последствиями и рекомендация. Строка закрывается только после сверки
оркестратором по факту; закрытые строки зачёркиваются с датой и фактом.

<!-- orch:owner -->
| ID | Что (команда ; ожидание) | Где описано | Открыто | Закрыто |
|----|--------------------------|-------------|---------|---------|
| ~~P-1~~ | ~~Repository transcriber: add `.worktreeinclude` in its root (a change of the project, made by a package there) so that every new worktree gets the gitignored files it needs: .env, .env.local (gitignore syntax, one pattern per line; directories as dir/**). Recommend (a) yes: sessions then never copy secrets or settings themselves~~ | orch.py init | 2026-10-07 | 2026-10-07: answered by D-1 |
| ~~P-2~~ | ~~Потоки программы: backend = api/**, worker/** ; frontend = web/** ; общие пути (только под блокировкой) = shared/**, api/prisma/**, pnpm-lock.yaml, **/package.json, .tl/**, graph-infra/**, config.yaml, CLAUDE.md. Варианты: (a) так и оставить; (b) резать по доменам (auth/workspaces, reports) сквозь слои. Рекомендую (a): авторизация и отчёты всё равно идут парой BE+FE через контракт в shared/, а доменная нарезка даст пересечения путей в api/src/routes и web/src/routes~~ | orch.yaml | 2026-10-07 | 2026-10-07: answered by D-2 |
| ~~P-3~~ | ~~Стенда нет: любой merge в main сразу деплоит прод (deploy-production.yml, base_deploys: prod). Для авторизации и миграции данных в рабочие пространства это рискованно. Варианты: (a) первым пакетом поднять staging (ветка develop -> тестовый стенд), merge пакетов в develop, в прод — пачкой по релизному листу; (b) оставить как есть, merge по одному с проверкой прода после каждого; (c) feature-флаги в проде. Рекомендую (a)~~ | orch.yaml | 2026-10-07 | 2026-10-07: answered by D-3 |
| ~~P-4~~ | ~~Рабочие пространства: что видит участник общего пространства? Варианты: (a) пространство — единица изоляции: все его участники видят все задачи, проекты и отзывы в нём; каждому пользователю при заведении создаётся личное пространство, общие — по членству; (b) внутри общего пространства каждый видит только свои задачи — тогда пространство теряет смысл, это просто папка. Рекомендую (a): «доступно только ему» обеспечивает личное пространство, совместная работа — общее~~ | PLAN.md | 2026-10-07 | 2026-10-07: answered by D-6 |
| ~~P-5~~ | ~~Существующие встречи на проде (без владельца): (a) перенести в одно пространство «Архив» и дать к нему доступ владельцу (вам); (b) перенести в личное пространство конкретного пользователя, имя укажете; (c) удалить. Рекомендую (a): ничего не теряется, доступ выдаётся явно~~ | PLAN.md | 2026-10-07 | 2026-10-07: answered by D-7 |
| ~~P-6~~ | ~~Форма входа: (a) имя (логин) + PIN: 10⁶ комбинаций на каждого, перебор режется лимитом попыток на логин; (b) только PIN: PIN обязан быть уникальным, атакующий перебирает один общий миллион и попадает в любого — небезопасно при росте числа пользователей. Рекомендую (a), плюс 5 неудачных попыток → блокировка логина на 15 минут, сессия-cookie на 30 дней~~ | PLAN.md | 2026-10-07 | 2026-10-07: answered by D-8 |
| ~~P-7~~ | ~~Когда вводить контекст: сейчас распознавание стартует сразу после загрузки (uc-100.service.ts:244-247). Варианты: (a) форма контекста на экране загрузки, заполняется пока идёт загрузка файла; распознавание стартует по кнопке «Начать» после загрузки и заполнения (контекст необязателен, можно пропустить); (b) контекст только для протокола: распознавание сразу, контекст добавляется до генерации протокола — тогда имена/термины не попадут в Deepgram; (c) автостарт как сейчас + возможность перегенерировать протокол с контекстом. Рекомендую (a): единственный вариант, где контекст доходит и до распознавания~~ | PLAN.md | 2026-10-07 | 2026-10-07: answered by D-9 |
| ~~P-8~~ | ~~Состав контекста встречи (поля): участники (имя, роль, организация, сторона: мы/клиент/подрядчик/другое), тип встречи (переговоры/статус/планёрка/интервью/другое), цель, повестка (текст), глоссарий (термин + варианты написания + пояснение), предыдущий протокол (из проекта автоматически или загрузить текстом/файлом), свободные заметки. Спикеров «Спикер N → Иван» сопоставляет LLM внутри генерации протокола по списку участников, без отдельного экрана. Варианты: (a) так; (b) добавить отдельный шаг ручного подтверждения сопоставления спикеров перед протоколом; (c) урезать до участников + повестки. Рекомендую (a); шаг (b) — в следующую программу по итогам обратной связи~~ | PLAN.md | 2026-10-07 | 2026-10-07: answered by D-10 |
| ~~P-9~~ | ~~Как проект накапливает знания: (a) карточка проекта (описание, участники, глоссарий) правится пользователем вручную; при запуске задачи с проектом подставляется карточка и последний протокол проекта; в форме задачи можно одной кнопкой добавить нового участника/термин в проект; (b) плюс автоматически: после каждого протокола LLM обновляет сводку проекта и реестр открытых задач с переносом между встречами. Рекомендую (a) сейчас: (b) — это та же доработка воркфлоу протоколов, которую логично делать в следующей программе по накопленной обратной связи~~ | PLAN.md | 2026-10-07 | 2026-10-07: answered by D-11 |
| ~~P-10~~ | ~~Word-файл с комментариями/правками: (a) сохраняем файл как есть + при загрузке извлекаем комментарии (с текстом, к которому они относятся) и правки w:ins/w:del в JSON (JSZip + XML-парсер), чтобы агент-аналитик работал с готовыми данными; (b) только сохраняем файл, разбор — в следующей программе. Рекомендую (a): разбор небольшой, а пользователь сразу видит, что комментарии распознаны, и ошибка формата всплывёт сейчас, а не через месяц~~ | PLAN.md | 2026-10-07 | 2026-10-07: answered by D-12 |
| ~~P-11~~ | ~~Где хранить граф задач и решений проекта (D-11, Q-3): (a) граф как модель в Postgres — таблицы узлов (Task, Decision, Participant, ProjectMemory) и рёбер (упоминание с цитатой, журнал изменений статуса, связи дубль/зависит/заменяет), без новых сервисов, в общих транзакциях и бэкапах, обходы через WITH RECURSIVE; (b) Neo4j в проде — Cypher и визуализация, но второе хранилище с JVM на той же VM (у dev-Neo4j уже был OOM), синхронизация и отдельные бэкапы; (c) Graphiti (Python-сервис + Neo4j/FalkorDB) — готовая темпоральная память, но 6–10 LLM-вызовов на встречу и схема без статусов задач и подтверждений; (d) Apache AGE (Cypher внутри Postgres) — кастомный образ БД, вне Prisma. Рекомендую (a): на сотнях встреч и тысячах задач выигрыша от графовой СУБД нет, а модель при необходимости выгружается в Neo4j без потерь~~ | reports/research-2026-10-07-project-memory.md | 2026-10-07 | 2026-10-07: answered by D-13 |
| ~~P-12~~ | ~~Кто подтверждает изменения в реестре задач: (a) новые задачи, упоминания и уверенные обновления применяются автоматически; закрытие, отмена, слияние дублей, смена исполнителя и всё неуверенное — в очередь «на подтверждение» в проекте с цитатой и кнопками «подтвердить/отклонить»; (b) всё автоматически, пользователь может откатить; (c) всё через подтверждение. Рекомендую (a): так делает рынок (Fellow, Read AI), это главная защита от выдуманных закрытий, и подтверждения — ценная обратная связь для следующей программы~~ | reports/research-2026-10-07-project-memory.md | 2026-10-07 | 2026-10-07: answered by D-14 |
| ~~R-1~~ | ~~Узнать память и загрузку прод-VM перед планированием лимитов Neo4j : ssh deploy@transcriber.itsalt.ru 'free -h; nproc; df -h /; docker stats --no-stream' (если домен не ведёт на VM — подставить PRODUCTION_HOST из секретов GitHub) ; expected: объём RAM и свободное место ; then: оркестратор впишет лимиты heap/pagecache в WP-INFRA-01~~ | work-packages/WP-INFRA-01-neo4j.md | 2026-10-07 | 2026-10-07: ssh deploy@transcriber.itsalt.ru 2026-10-07: Mem 7.8Gi (used 3.2Gi, avail 4.6Gi), swap 2.0Gi (715Mi used), nproc 4, / 30G used 24G avail 4.6G (84%); docker stats: fc-neo4j 1.276GiB/2GiB, learn-mattermost, learn-postgres, learn-redis; лимиты вписаны в WP-INFRA-01 раздел 2 (D-16) |
| ~~R-2~~ | ~~Диск прод-VM заполнен на 84 % (4.6 GB свободно) — до запуска Neo4j памяти проекта выяснить, куда ушли 24 GB : ssh deploy@transcriber.itsalt.ru 'docker system df; sudo journalctl --disk-usage; sudo du -xh --max-depth=2 / 2>/dev/null \| sort -h \| tail -25' ; expected: таблица docker (образы/volumes/build cache), размер журналов, топ-25 каталогов ; then: оркестратор предложит, что чистить (R-n с командой), цель — не меньше 8 GB свободно~~ | work-packages/WP-INFRA-01-neo4j.md | 2026-10-07 | 2026-10-07: ssh 2026-10-07: docker system df — images 2.82 GB, containers 348 MB, volumes 804 MB, reclaimable 0; journald 2.0 GB; du: /var 9.7G (/var/lib 7.1G, /var/log 2.5G), /opt 4.4G (transcrib 604M, procontent 1.4G, learn 1.2G, atech 381M, google 405M), /home 3.0G (/home/deploy 2.9G), /usr 4.2G |
| ~~R-3~~ | ~~Освободить диск прод-VM, шаг 1 (безопасно): ужать системный журнал и посмотреть, что лежит в /home/deploy, /var/lib и /var/log : ssh deploy@transcriber.itsalt.ru 'sudo journalctl --vacuum-size=200M; sudo du -xh --max-depth=1 /home/deploy /var/lib /var/log 2>/dev/null \| sort -h \| tail -20; df -h /' ; expected: журнал ужат (~1.8 GB освобождено, df покажет ≈6.4 GB свободно), топ каталогов /home/deploy, /var/lib, /var/log ; then: оркестратор даст шаг 2 (кэши pnpm/npm в /home/deploy, старые логи pm2, остановленные образы) до цели 8 GB~~ | work-packages/WP-INFRA-01-neo4j.md | 2026-10-07 | 2026-10-07: ssh 2026-10-07: journalctl --vacuum-size=200M freed 1.9G; df /: 22G used, 6.6G avail (77%); du: /var/lib/snapd 3.1G, /var/lib/containerd 2.7G, /home/deploy/.local 2.0G, /var/lib/docker 1.2G, /home/deploy/.npm 1000M, .nvm 659M, /var/log 473M (caddy 126M, journal 152M) |
| ~~R-4~~ | ~~Дать этой машине доступ к docker, чтобы оркестратор проверил в клоне критерии 1 и 4 WP-INFRA-01 (compose up memory-neo4j с лимитами D-16, бэкап и восстановление): sudo usermod -aG docker cloudpc ; expected: после нового входа пользователя cloudpc команда 'docker ps' работает без permission denied ; then: оркестратор повторит проверку в одноразовом клоне и допишет отчёт ревью. Альтернатива, если доступ давать не хотите: выполните сами на машине с docker 'git fetch origin && git checkout 278863f && docker compose up -d memory-neo4j && docker inspect --format {{.HostConfig.Memory}} $(docker compose ps -q memory-neo4j) && bash scripts/neo4j-backup.sh && bash scripts/neo4j-restore.sh <последний дамп>' и пришлите вывод~~ | reports/wp-infra-01-review-20261007.md | 2026-10-07 | 2026-10-07: sg docker -c 'docker ps' под cloudpc 2026-10-07: список контейнеров без permission denied; docker compose 2.37.1 |
| ~~R-5~~ | ~~Освободить диск прод-VM, шаг 2 (кэши, безопасно, прод не трогает): npm-кэш, pnpm store, выключенные ревизии snap, кэш apt; и посмотреть, что в containerd и .local : ssh deploy@transcriber.itsalt.ru 'npm cache clean --force; pnpm store prune 2>/dev/null; sudo snap set system refresh.retain=2; sudo snap list --all \| awk "/disabled/{print \$1, \$3}" \| while read n r; do sudo snap remove "$n" --revision="$r"; done; sudo apt-get clean; sudo du -xh --max-depth=1 /var/lib/containerd /home/deploy/.local /var/lib/snapd 2>/dev/null \| sort -h \| tail -15; df -h /' ; expected: освобождено 1–2 GB (цель ≥ 8 GB свободно), топ подкаталогов containerd/.local/snapd ; then: оркестратор решит, нужен ли шаг 3 (containerd 2.7G — вероятно, неиспользуемые образы)~~ | work-packages/WP-INFRA-01-neo4j.md | 2026-10-07 | 2026-10-07: ssh 2026-10-07: npm cache clean + apt-get clean выполнены; snap-часть не выполнилась (awk сломан кавычками PowerShell); df /: 21G used, 7.6G avail (73%); /var/lib/snapd/cache 3.1G; /var/lib/containerd 2.7G = хранилище образов docker (docker system df: images 2.82GB, reclaimable 0) — не чистить; /home/deploy/.local/share 2.0G |
| R-6 | Освободить диск прод-VM, шаг 3: удалить кэш скачанных snap-пакетов (snapd пересоздаёт его сам, установленные snap не трогаются) и посмотреть, что в /home/deploy/.local/share : ssh deploy@transcriber.itsalt.ru 'sudo rm -rf /var/lib/snapd/cache/*; sudo du -xh --max-depth=2 /home/deploy/.local/share \| sort -h \| tail -6; df -h /' ; expected: около 3 GB освобождено, df покажет примерно 10.5 GB свободно (цель 8 GB достигнута), топ-6 подкаталогов .local/share ; then: оркестратор закроет тему диска или даст точечный шаг по .local/share (обычно pnpm store) | work-packages/WP-INFRA-01-neo4j.md | 2026-10-07 |  |
| P-13 | Поведение деплоя после включения Neo4j памяти (MEMORY_NEO4J_URI задан): шаг graph:migrate в deploy-production.yml сейчас фатальный и стоит после миграций Postgres, но до rsync и pm2 — при падении Neo4j (например, OOM-перезапуск) любой деплой несвязанных изменений остановится в полусостоянии (схема Postgres новая, процессы старые). Варианты: (a) оставить фатальным, как db:migrate:deploy; (b) сделать шаг нефатальным: ошибка печатается ::error::, деплой продолжается, воркер обязан работать без графа (деградация), владельцу — пункт на ручной graph:migrate; (c) перенести шаг после pm2 start. Рекомендую (b): память проекта — вспомогательная подсистема, она не должна блокировать выкладку исправлений основного продукта; требование деградации уже заложено в WP-WORKER-MEMORY-01 | reports/wp-infra-01-review-20261007.md | 2026-10-07 |  |
| R-7 | Какие .env есть на прод-VM (шаг деплоя читает /opt/transcrib/.env, а pm2 и воркер — api/.env и worker/.env; если корневого .env нет, шаг graph:migrate будет молча пропускаться) : ssh deploy@transcriber.itsalt.ru 'ls -la /opt/transcrib/.env /opt/transcrib/api/.env /opt/transcrib/worker/.env 2>&1; ls -la /opt/transcrib/ecosystem.config.cjs' ; expected: какие из трёх файлов существуют (содержимое не нужно) ; then: оркестратор впишет точный файл в README-neo4j и в пункт REVISE WP-INFRA-01 | reports/wp-infra-01-review-20261007.md | 2026-10-07 |  |
| R-8 | Бэкап БД прода перед merge WP-BACKEND-06 — блокирует доставку (D-4: пакет с миграцией; первая миграция программы с бэкфиллами): ssh deploy@transcriber.itsalt.ru 'cd /opt/transcrib/api && set -a && . ./.env && set +a && mkdir -p ~/backup && pg_dump "$DATABASE_URL" -Fc -f ~/backup/transcrib-before-backend06-$(date +%Y%m%d-%H%M).dump && ls -la ~/backup \| tail -3 && df -h / \| tail -1' ; expected: файл transcrib-before-backend06-<дата>.dump ненулевого размера в /home/deploy/backup, свободное место на диске не ниже 6 GB ; then: оркестратор сверит имя и размер файла, закроет пункт и выполнит доставку после ACCEPTED | work-packages/WP-BACKEND-06-contract.md | 2026-10-07 |  |

## Замки

Общие пути и ресурсы репозитория; только держатель правит общий путь, пушит миграцию,
проверяет на стенде, запускает dev-стек на фиксированных портах. Держатель отдаёт замок
после merge или проверки. «Ждут» — пакеты в очереди на замок.

<!-- orch:locks -->
| Замок | Репозиторий | Держатель | С | Ждут | Примечание |
|-------|-------------|-----------|---|------|------------|
| transcriber:api/prisma/** | transcriber | WP-BACKEND-06 | 2026-10-07 16:47Z | — | dispatch |
| transcriber:shared/** | transcriber | WP-BACKEND-06 | 2026-10-07 16:47Z | — | dispatch |
| transcriber:package.json | transcriber | WP-BACKEND-06 | 2026-10-07 16:47Z | — | dispatch |
| transcriber:pnpm-lock.yaml | transcriber | WP-BACKEND-06 | 2026-10-07 16:47Z | — | dispatch |
| transcriber:api/src/server.ts | transcriber | WP-BACKEND-06 | 2026-10-07 16:47Z | — | dispatch |
| transcriber:worker/src/job-processor.ts | transcriber | WP-BACKEND-06 | 2026-10-07 16:47Z | — | dispatch |
| transcriber:worker/src/queues.ts | transcriber | WP-BACKEND-06 | 2026-10-07 16:47Z | — | dispatch |
| transcriber:worker/src/index.ts | transcriber | WP-BACKEND-06 | 2026-10-07 16:47Z | — | dispatch |
| transcriber:.tl/** | transcriber | WP-BACKEND-06 | 2026-10-07 16:47Z | — | dispatch |
| transcriber:migrations | transcriber | WP-BACKEND-06 | 2026-10-07 16:47Z | — | dispatch |
| transcriber:api/package.json | transcriber | WP-BACKEND-06 | 2026-10-07 16:48Z | — | narrowed from **/package.json: the package edits only the workspace manifests |
| transcriber:worker/package.json | transcriber | WP-BACKEND-06 | 2026-10-07 16:48Z | — | narrowed from **/package.json: the package edits only the workspace manifests |
| transcriber:web/package.json | transcriber | WP-BACKEND-06 | 2026-10-07 16:48Z | — | narrowed from **/package.json: the package edits only the workspace manifests |
| transcriber:shared/package.json | transcriber | WP-BACKEND-06 | 2026-10-07 16:48Z | — | narrowed from **/package.json: the package edits only the workspace manifests |

## Очередь слияний

При `merge_policy: sequential`: по одному; после каждого merge — зелёный деплой
стенда и health-check, затем rebase следующего пакета.

<!-- orch:merge -->
| # | Репозиторий | WP | PR | Rebase после | Статус |
|---|-------------|----|----|--------------|--------|
| 1 | transcriber | WP-FRONTEND-01 | https://github.com/ITSalt/transcriber/pull/9 | — | merged |
| 2 | transcriber | WP-INFRA-01 | https://github.com/ITSalt/transcriber/pull/10 | WP-FRONTEND-01 | merged |
| 3 | transcriber | WP-INFRA-02 | https://github.com/ITSalt/transcriber/pull/11 | — | merged |

## Журнал

Новые сверху. Одна строка на событие: время (UTC), WP, что произошло, чем подтверждено.

<!-- orch:journal -->
| Дата | WP | Событие | Подтверждение |
|------|----|---------|---------------|
| 2026-10-07 18:25Z | WP-BACKEND-06 | WP-BACKEND-06: READY 8de4cd4, PR #12 (40 файлов, +3810/−44; миграция 20261007120000_program_product_schema); review-start: 3 файла вне путей (api/src/features/index.ts — разрешён шапкой пакета; worker/src/job-processor.modules.test.ts; worker/tsconfig.json); ревьюер запущен; R-8 бэкап БД (блокирует доставку) | orch.py review-start; gh pr view 12; CI 37666044596 pass |
| 2026-10-07 18:25Z | — | R-8 opened for owner | work-packages/WP-BACKEND-06-contract.md |
| 2026-10-07 18:23Z | WP-BACKEND-06 | WP-BACKEND-06: review round 1 started at 8de4cd4b93 | reports/wp-backend-06-review-20261007.md |
| 2026-10-07 18:23Z | WP-BACKEND-06 | WP-BACKEND-06: IN_PROGRESS -> REVIEW | READY 8de4cd4, PR #12 |
| 2026-10-07 18:19Z | WP-INFRA-02 | WP-INFRA-02: доставлен на прод — merge b8040ccb2d (squash), Deploy to Production success, verify --env prod PASS; в логе деплоя миграции (No pending migrations) раньше сборки shared | reports/verify-WP-INFRA-02-prod-20261007.md; gh run 37665495025 |
| 2026-10-07 18:18Z | WP-INFRA-02 | WP-INFRA-02: VERIFIED_TEST -> PROD | verify --env prod b8040ccb2d: reports/verify-WP-INFRA-02-prod-20261007.md |
| 2026-10-07 18:18Z | WP-INFRA-02 | WP-INFRA-02: MERGED -> VERIFIED_TEST | verify --env test b8040ccb2d: reports/verify-WP-INFRA-02-test-20261007.md |
| 2026-10-07 18:17Z | WP-BACKEND-06 | WP-BACKEND-06: UNLOCK graph (TECH-027 done, commit 389ac5d) | сообщение product-backend |
| 2026-10-07 18:17Z | WP-BACKEND-06 | lock transcriber:graph released | orch.py lock |
| 2026-10-07 18:15Z | WP-INFRA-02 | WP-INFRA-02 merged in the merge queue | orch.py deliver: b8040ccb2d |
| 2026-10-07 18:15Z | WP-INFRA-02 | WP-INFRA-02: ACCEPTED -> MERGED | gh pr merge --squash: b8040ccb2d (https://github.com/ITSalt/transcriber/pull/11) |
| 2026-10-07 18:15Z | WP-BACKEND-06 | WP-BACKEND-06: LOCK graph выдан повторно (TECH-027 → done, внутреннее ревью APPROVED) | сообщение product-backend; orch.py lock acquire graph |
| 2026-10-07 18:15Z | WP-BACKEND-06 | lock transcriber:graph acquired | LOCK message: TECH-027 in_progress -> done + commit sha |
| 2026-10-07 18:14Z | WP-INFRA-02 | WP-INFRA-02 queued for merge (sequential) | https://github.com/ITSalt/transcriber/pull/11 |
| 2026-10-07 18:14Z | WP-INFRA-02 | WP-INFRA-02: accepted at 6694e5e172d330b5c7cd1404dc38cd5c30fb17a9 | report reports/wp-infra-02-review-20261007-r2.md |
| 2026-10-07 18:14Z | WP-INFRA-02 | WP-INFRA-02: REVIEW -> ACCEPTED | 6694e5e172; reports/wp-infra-02-review-20261007-r2.md |
| 2026-10-07 18:13Z | WP-INFRA-02 | WP-INFRA-02: REVISE -> REVIEW | 6694e5e172; report reports/wp-infra-02-review-20261007-r2.md |
| 2026-10-07 18:13Z | WP-INFRA-02 | WP-INFRA-02: REVIEW -> REVISE | reports/wp-infra-02-review-20261007.md: 1 пункт — подсказка отката (строки 126-128): Prisma-клиент уже новый до миграции, откат нужен и должен включать db:generate |
| 2026-10-07 18:08Z | WP-INFRA-02 | WP-INFRA-02: IN_PROGRESS -> REVIEW | 8253fece3d; report reports/wp-infra-02-review-20261007.md |
| 2026-10-07 18:08Z | WP-INFRA-02 | WP-INFRA-02: DISPATCHING -> IN_PROGRESS | PR #11 открыт сессией product-infra, sha 8253fece3d1265e61547391e81d1f42a195d7192 |
| 2026-10-07 18:07Z | WP-BACKEND-06 | WP-BACKEND-06: QUESTION — риск порядка деплоя (dist и Prisma-клиент заменяются до db:migrate:deploy; pm2 max_memory_restart в окне или упавшая миграция = новый код на старой схеме). ANSWER: отдельный пакет WP-INFRA-02 (migrate до сборок), мерж до BACKEND-06; BACKEND-06 подтверждает в PR совместимость миграции со старым кодом | сообщение product-backend; deploy-production.yml:49-58 на main 9e5d534 |
| 2026-10-07 18:06Z | WP-INFRA-02 | WP-INFRA-02: READY -> DISPATCHING | TASK message to live session; model sonnet |
| 2026-10-07 18:06Z | WP-INFRA-02 | dispatch of WP-INFRA-02 refused: depends on WP-BACKEND-06 (IN_PROGRESS), not merged yet | orch.py dispatch |
| 2026-10-07 18:06Z | WP-INFRA-02 | WP-INFRA-02: DRAFT -> READY | разделы заполнены; находка product-backend о порядке деплоя; D-3 |
| 2026-10-07 18:05Z | WP-INFRA-02 | WP-INFRA-02 created (DRAFT) | work-packages/WP-INFRA-02-deploy-migrate-first.md |
| 2026-10-07 17:46Z | WP-INFRA-01 | WP-INFRA-01: доставлен на прод — merge 9e5d534ca5 (squash), Deploy to Production success, CI main success, verify --env prod PASS; живой сценарий: шаг graph:migrate в деплое (см. отчёт verify prod) | reports/verify-WP-INFRA-01-prod-20261007.md; gh run 37661241627 |
| 2026-10-07 17:45Z | WP-INFRA-01 | WP-INFRA-01: VERIFIED_TEST -> PROD | verify --env prod 9e5d534ca5: reports/verify-WP-INFRA-01-prod-20261007.md |
| 2026-10-07 17:45Z | WP-INFRA-01 | WP-INFRA-01: MERGED -> VERIFIED_TEST | verify --env test 9e5d534ca5: reports/verify-WP-INFRA-01-test-20261007.md |
| 2026-10-07 17:43Z | WP-BACKEND-06 | WP-BACKEND-06: QUESTION (instructions check exit 1) — ANSWER: не блокирует, D-17; READY после ревью сессии | SendMessage aaf9ace0 |
| 2026-10-07 17:43Z | WP-INFRA-01 | WP-INFRA-01 merged in the merge queue | orch.py deliver: 9e5d534ca5 |
| 2026-10-07 17:43Z | WP-INFRA-01 | WP-INFRA-01: ACCEPTED -> MERGED | gh pr merge --squash: 9e5d534ca5 (https://github.com/ITSalt/transcriber/pull/10) |
| 2026-10-07 17:41Z | WP-INFRA-01 | WP-INFRA-01: READY 0e7ebe8 — merge origin/main в ветку без force; диф к 1f33af8 по файлам пакета пуст; ревизия принята | git log 0e7ebe8: parents 1f33af8 e31feb3; git diff --stat 1f33af8 0e7ebe8 -- <files>: пусто |
| 2026-10-07 17:41Z | WP-INFRA-01 | WP-INFRA-01: accepted at 0e7ebe85d3bacf83b3d1146e36e776afa9f49d1f | report reports/wp-infra-01-review-20261007-r2.md |
| 2026-10-07 17:40Z | WP-INFRA-01 | WP-INFRA-01: QUESTION — отказ правила на git push --force-with-lease после rebase (намеренный deny); ANSWER: вместо rebase влить origin/main merge-коммитом и запушить обычным push, затем READY с новым sha; моё указание «rebase + force-with-lease» было ошибкой против настроек модуля | сообщение product-infra; SendMessage 66dfcd6d |
| 2026-10-07 17:39Z | WP-FRONTEND-01 | WP-FRONTEND-01: доставлен на прод — merge e31feb393f (squash), Deploy to Production зелёный, verify --env prod PASS, живой сценарий: CSS прода содержит токены ITSALT, шрифты отдаются, слот шапки в бандле | reports/verify-WP-FRONTEND-01-prod-20261007.md; curl assets/index-Blhzfsef.css |
| 2026-10-07 17:39Z | WP-FRONTEND-01 | WP-FRONTEND-01: VERIFIED_TEST -> PROD | verify --env prod e31feb393f: reports/verify-WP-FRONTEND-01-prod-20261007.md |
| 2026-10-07 17:38Z | WP-FRONTEND-01 | WP-FRONTEND-01: MERGED -> VERIFIED_TEST | verify --env test e31feb393f: reports/verify-WP-FRONTEND-01-test-20261007.md |
| 2026-10-07 17:36Z | WP-BACKEND-06 | WP-BACKEND-06: UNLOCK graph — сессия сообщает: ADR-013, FR-003..006, DEC-006..009, модули, сущности, enum, UC-400..605, TECH-027 записаны в граф | сообщение product-backend; проверка ADR-013 read-cypher ниже |
| 2026-10-07 17:36Z | WP-BACKEND-06 | lock transcriber:graph released | orch.py lock |
| 2026-10-07 17:36Z | WP-FRONTEND-01 | WP-FRONTEND-01 merged in the merge queue; released transcriber:web/src/App.tsx, transcriber:web/src/i18n/** | orch.py deliver: e31feb393f |
| 2026-10-07 17:36Z | WP-FRONTEND-01 | WP-FRONTEND-01: ACCEPTED -> MERGED | gh pr merge --squash: e31feb393f (https://github.com/ITSalt/transcriber/pull/9) |
| 2026-10-07 17:36Z | WP-FRONTEND-01 | Порядок доставки: WP-FRONTEND-01 доставляется первым (плановый порядок BACKEND-06 → INFRA-01 → FRONTEND-01 был удобством, не зависимостью): у FRONTEND-01 «Зависит от: нет», спецификации нет; INFRA-01 ждёт ADR-013 от BACKEND-06 (гейт G9, A-4); BACKEND-06 ещё в работе. deliver --check WP-FRONTEND-01: G1–G10 зелёные | orch.py deliver --check WP-FRONTEND-01 2026-10-07 |
| 2026-10-07 17:35Z | WP-INFRA-01 | WP-INFRA-01 queued for merge (sequential) | https://github.com/ITSalt/transcriber/pull/10 |
| 2026-10-07 17:35Z | WP-INFRA-01 | WP-INFRA-01: accepted at 1f33af81e2e93adec05c0c41e62e81e8579ad884 | report reports/wp-infra-01-review-20261007-r2.md |
| 2026-10-07 17:35Z | WP-INFRA-01 | WP-INFRA-01: REVIEW -> ACCEPTED | 1f33af81e2; reports/wp-infra-01-review-20261007-r2.md |
| 2026-10-07 17:29Z | WP-INFRA-01 | WP-INFRA-01: REVISE -> REVIEW | 1f33af81e2; report reports/wp-infra-01-review-20261007-r2.md |
| 2026-10-07 17:27Z | WP-INFRA-01 | WP-INFRA-01: восстановление подтверждено (после wipe 0 узлов, после restore 1), ротация 2 копии, compose down -v чисто | tasks/b4yp0nvm6.output 2026-10-07 17:23Z |
| 2026-10-07 17:27Z | WP-INFRA-01 | WP-INFRA-01: REVIEW -> REVISE | reports/wp-infra-01-review-20261007.md: 4 пункта (eval .env в шаге деплоя; README про файл и порядок задания пароля; условно по P-13 нефатальный graph:migrate; мелкие в скриптах ps -aq / guard restore / .partial); критерии 1 и 4 подтверждены вживую оркестратором |
| 2026-10-07 17:25Z | WP-FRONTEND-01 | WP-FRONTEND-01 queued for merge (sequential) | https://github.com/ITSalt/transcriber/pull/9 |
| 2026-10-07 17:25Z | WP-FRONTEND-01 | WP-FRONTEND-01: accepted at 364b6b9fb88fa04d81e2708cbd292c860062affa | report reports/wp-frontend-01-review-20261007-r2.md |
| 2026-10-07 17:25Z | WP-FRONTEND-01 | WP-FRONTEND-01: REVIEW -> ACCEPTED | 364b6b9fb8; reports/wp-frontend-01-review-20261007-r2.md |
| 2026-10-07 17:23Z | WP-FRONTEND-01 | WP-FRONTEND-01: REVISE -> REVIEW | 364b6b9fb8; report reports/wp-frontend-01-review-20261007-r2.md |
| 2026-10-07 17:20Z | WP-INFRA-01 | WP-INFRA-01: живая проверка в одноразовом клоне (278863f, docker via sg): memory-neo4j healthy через ~60 с; docker inspect Memory=1610612736, restart unless-stopped, порты 127.0.0.1:7475/7688; SHOW SETTINGS: heap 512/512 MiB, pagecache 256 MiB, transaction.total.max 256 MiB, -XX:+ExitOnOutOfMemoryError добавлен к server.jvm.additional; neo4j-backup.sh: дамп успешен, neo4j-<ts>.dump.gz записан; восстановление — повторный прогон с ожиданием готовности | tasks/b46og3s5u.output 2026-10-07 17:19Z |
| 2026-10-07 17:18Z | — | R-7 opened for owner | reports/wp-infra-01-review-20261007.md |
| 2026-10-07 17:18Z | — | P-13 opened for owner | reports/wp-infra-01-review-20261007.md |
| 2026-10-07 17:17Z | — | R-4 closed | sg docker -c 'docker ps' под cloudpc 2026-10-07: список контейнеров без permission denied; docker compose 2.37.1 |
| 2026-10-07 17:17Z | WP-FRONTEND-01 | WP-FRONTEND-01: REVIEW -> REVISE | reports/wp-frontend-01-review-20261007.md: 2 пункта (тест features.test.tsx утверждает глобальный реестр точно — ломает параллельные потоки, D-15; скриншоты страницы встречи показывают только состояние ошибки, AC-3) |
| 2026-10-07 17:14Z | — | R-6 opened for owner | work-packages/WP-INFRA-01-neo4j.md |
| 2026-10-07 17:14Z | — | R-5 closed | ssh 2026-10-07: npm cache clean + apt-get clean выполнены; snap-часть не выполнилась (awk сломан кавычками PowerShell); df /: 21G used, 7.6G avail (73%); /var/lib/snapd/cache 3.1G; /var/lib/containerd 2.7G = хранилище образов docker (docker system df: images 2.82GB, reclaimable 0) — не чистить; /home/deploy/.local/share 2.0G |
| 2026-10-07 17:12Z | — | Дефекты плагина оформлены вручную (D-18): PLUGIN-BUG-1 → ITSalt/PepperSkills#32 (стартовый промпт требует instructions sync), PLUGIN-BUG-2 → #33 (report --check не проходит свою анонимизацию при origin-owner = организация плагина), PLUGIN-BUG-3 → #34 (коллизия замков по глобу на несуществующем файле) | gh issue create: issues/32, /33, /34; bugs/PLUGIN-BUG-{1,2,3}.md |
| 2026-10-07 17:10Z | — | R-5 opened for owner | work-packages/WP-INFRA-01-neo4j.md |
| 2026-10-07 17:10Z | — | R-3 closed | ssh 2026-10-07: journalctl --vacuum-size=200M freed 1.9G; df /: 22G used, 6.6G avail (77%); du: /var/lib/snapd 3.1G, /var/lib/containerd 2.7G, /home/deploy/.local 2.0G, /var/lib/docker 1.2G, /home/deploy/.npm 1000M, .nvm 659M, /var/log 473M (caddy 126M, journal 152M) |
| 2026-10-07 17:10Z | — | D-18 recorded | — |
| 2026-10-07 17:07Z | WP-INFRA-01 | WP-INFRA-01: ревью начато; критерии 1 и 4 (docker) не проверяемы на этой машине — R-4 владельцу; ADR-013 в графе нет, пишет BACKEND-06 (A-4) | docker version: permission denied; id -nG cloudpc: без docker; read-cypher: ADR-001..ADR-012 |
| 2026-10-07 17:07Z | — | A-4 recorded | — |
| 2026-10-07 17:07Z | — | R-4 opened for owner | reports/wp-infra-01-review-20261007.md |
| 2026-10-07 17:04Z | WP-INFRA-01 | WP-INFRA-01: IN_PROGRESS -> REVIEW | 278863f54e; report reports/wp-infra-01-review-20261007.md |
| 2026-10-07 17:03Z | WP-FRONTEND-01 | WP-FRONTEND-01: IN_PROGRESS -> REVIEW | c8de8c2e8c; report reports/wp-frontend-01-review-20261007.md |
| 2026-10-07 17:02Z | WP-FRONTEND-01 | WP-FRONTEND-01: QUESTION (instructions sync) — ANSWER D-17 вариант (a); ждём READY | SendMessage 21ca74d7; PR #9 |
| 2026-10-07 17:02Z | WP-FRONTEND-01 | WP-FRONTEND-01: DISPATCHING -> IN_PROGRESS | gh pr view 9: PR #9 feature/wp-frontend-01-design-system открыт сессией product-frontend, sha c8de8c2; QUESTION про instructions sync — ANSWER по D-17 (a) |
| 2026-10-07 16:55Z | — | Дефект плагина не записан: orch.py report --check отказывает «name from orch.yaml (6 characters)» даже с однострочным логом без имён — утечку находит в собственных собранных фактах; запись bugs/PLUGIN-BUG-n отложена (два кандидата: стартовый промпт требует instructions sync вопреки концепции §2; report --check не проходит собственную анонимизацию) | orch.py report --check --log <1 строка> 2026-10-07: nothing was written |
| 2026-10-07 16:55Z | — | R-3 opened for owner | work-packages/WP-INFRA-01-neo4j.md |
| 2026-10-07 16:55Z | — | R-2 closed | ssh 2026-10-07: docker system df — images 2.82 GB, containers 348 MB, volumes 804 MB, reclaimable 0; journald 2.0 GB; du: /var 9.7G (/var/lib 7.1G, /var/log 2.5G), /opt 4.4G (transcrib 604M, procontent 1.4G, learn 1.2G, atech 381M, google 405M), /home 3.0G (/home/deploy 2.9G), /usr 4.2G |
| 2026-10-07 16:54Z | WP-INFRA-01 | WP-INFRA-01: QUESTION (push, instructions sync) — ANSWER по D-17 вариант (b), push повторить | SendMessage 0f03ea07 |
| 2026-10-07 16:54Z | — | GitHub отклоняет push (remote rejected, Internal Server Error) для orch/product и feature/wp-infra-01-neo4j; локальные коммиты рабочего пространства не запушены (3ff61f9+); повтор позже | git push origin orch/product 2026-10-07 16:53Z: remote rejected (Internal Server Error); product-infra: 3 попытки, request IDs C84E…, C6AA…, CFC2… |
| 2026-10-07 16:54Z | WP-INFRA-01 | WP-INFRA-01: DISPATCHING -> IN_PROGRESS | сообщение product-infra 2026-10-07: работа закоммичена локально (278863f на feature/wp-infra-01-neo4j), push отклонён GitHub (Internal Server Error), PR пока нет |
| 2026-10-07 16:52Z | WP-BACKEND-06 | WP-BACKEND-06: LOCK graph выдан (ACK); QUESTION про CLAUDE.md/AGENTS.md — ANSWER по D-17 (вариант а) | сообщения product-backend 2026-10-07; orch.py lock acquire graph: held; instructions check exit 0 |
| 2026-10-07 16:52Z | — | D-17 recorded | — |
| 2026-10-07 16:52Z | WP-BACKEND-06 | lock transcriber:graph acquired | LOCK message: /nacl-sa-feature FR-003..FR-006 — доменная модель программы в Neo4j |
| 2026-10-07 16:51Z | WP-BACKEND-06 | WP-BACKEND-06: DISPATCHING -> IN_PROGRESS | ListAgents 2026-10-07 ~16:55Z: сессия product-backend запущена (busy), PR пока нет |
| 2026-10-07 16:51Z | — | R-2 opened for owner | work-packages/WP-INFRA-01-neo4j.md |
| 2026-10-07 16:51Z | — | R-1 closed | ssh deploy@transcriber.itsalt.ru 2026-10-07: Mem 7.8Gi (used 3.2Gi, avail 4.6Gi), swap 2.0Gi (715Mi used), nproc 4, / 30G used 24G avail 4.6G (84%); docker stats: fc-neo4j 1.276GiB/2GiB, learn-mattermost, learn-postgres, learn-redis; лимиты вписаны в WP-INFRA-01 раздел 2 (D-16) |
| 2026-10-07 16:51Z | — | D-16 recorded | — |
| 2026-10-07 16:48Z | WP-FRONTEND-01 | WP-FRONTEND-01: READY -> DISPATCHING | start command handed to the owner; model sonnet; locks transcriber:web/src/App.tsx, transcriber:web/src/i18n/** |
| 2026-10-07 16:48Z | WP-BACKEND-06 | WP-BACKEND-06: declared shared path **/package.json narrowed to the four workspace manifests (api, worker, web, shared); the glob collided with web/src/i18n/** of WP-FRONTEND-01 on a file neither package creates (FRONTEND-01 adds no npm dependencies) | dispatch WP-FRONTEND-01: refused, lock **/package.json overlaps web/src/i18n/**; WP-FRONTEND-01 header: без новых npm-зависимостей; ls web/src/i18n: config.ts en.json ru.json |
| 2026-10-07 16:48Z | WP-BACKEND-06 | lock transcriber:shared/package.json acquired | narrowed from **/package.json: the package edits only the workspace manifests |
| 2026-10-07 16:48Z | WP-BACKEND-06 | lock transcriber:web/package.json acquired | narrowed from **/package.json: the package edits only the workspace manifests |
| 2026-10-07 16:48Z | WP-BACKEND-06 | lock transcriber:worker/package.json acquired | narrowed from **/package.json: the package edits only the workspace manifests |
| 2026-10-07 16:48Z | WP-BACKEND-06 | lock transcriber:api/package.json acquired | narrowed from **/package.json: the package edits only the workspace manifests |
| 2026-10-07 16:48Z | WP-BACKEND-06 | lock transcriber:**/package.json released | orch.py lock |
| 2026-10-07 16:47Z | WP-INFRA-01 | WP-INFRA-01: READY -> DISPATCHING | start command handed to the owner; model sonnet |
| 2026-10-07 16:47Z | WP-FRONTEND-01 | dispatch of WP-FRONTEND-01 refused: lock transcriber:**/package.json is held by WP-BACKEND-06 (overlaps web/src/i18n/**) | orch.py dispatch |
| 2026-10-07 16:47Z | WP-BACKEND-06 | WP-BACKEND-06: READY -> DISPATCHING | start command handed to the owner; model opus, effort high; locks transcriber:api/prisma/**, transcriber:shared/**, transcriber:package.json, transcriber:**/package.json, transcriber:pnpm-lock.yaml, transcriber:api/src/server.ts, transcriber:worker/src/job-processor.ts, transcriber:worker/src/queues.ts, transcriber:worker/src/index.ts, transcriber:.tl/**, transcriber:migrations |
| 2026-10-07 16:46Z | — | resume: reconciled — no sessions, no program branches/PRs, no locks; main checkout /home/cloudpc/projects/transcriber has an uncommitted edit to config.yaml (neo4j_http_port 3574->3614, shared path, no package owns it; worktrees branch from origin/main so it does not reach packages) | ListAgents: only product-coord; git branch -r: no feature/wp-* ; gh pr list: last PR #8 MERGED 2026-08-17; git status: M config.yaml |
| 2026-10-07 16:38Z | — | repo path fixed to the main checkout /home/cloudpc/projects/transcriber; start commands of active WPs updated | dispatch --dry-run WP-BACKEND-06/FRONTEND-01/INFRA-01: ok |
| 2026-10-07 16:36Z | WP-WEB-MEMORY-01 | WP-WEB-MEMORY-01: DRAFT -> READY | разделы заполнены; D-11..D-15 |
| 2026-10-07 16:36Z | WP-WEB-FEEDBACK-01 | WP-WEB-FEEDBACK-01: DRAFT -> READY | разделы заполнены; D-11..D-15 |
| 2026-10-07 16:36Z | WP-WEB-PROJECTS-01 | WP-WEB-PROJECTS-01: DRAFT -> READY | разделы заполнены; D-11..D-15 |
| 2026-10-07 16:36Z | WP-API-MEMORY-01 | WP-API-MEMORY-01: DRAFT -> READY | разделы заполнены; D-11..D-15 |
| 2026-10-07 16:36Z | WP-API-FEEDBACK-01 | WP-API-FEEDBACK-01: DRAFT -> READY | разделы заполнены; D-11..D-15 |
| 2026-10-07 16:36Z | WP-API-PROJECTS-01 | WP-API-PROJECTS-01: DRAFT -> READY | разделы заполнены; D-11..D-15 |
| 2026-10-07 16:36Z | WP-WORKER-MEMORY-01 | WP-WORKER-MEMORY-01: DRAFT -> READY | разделы заполнены; D-11..D-15 |
| 2026-10-07 16:36Z | WP-WORKER-01 | WP-WORKER-01: DRAFT -> READY | разделы заполнены; D-11..D-15 |
| 2026-10-07 16:36Z | WP-INFRA-01 | WP-INFRA-01: DRAFT -> READY | разделы заполнены; D-11..D-15 |
| 2026-10-07 16:36Z | WP-BACKEND-06 | WP-BACKEND-06: DRAFT -> READY | разделы заполнены; D-11..D-15 |
| 2026-10-07 16:36Z | WP-WORKER-MEMORY-01 | WP-WORKER-MEMORY-01: model opus, effort high (многошаговый LLM-пайплайн, сопоставление задач между встречами, машина статусов, второе хранилище) | orch.py model |
| 2026-10-07 16:36Z | WP-WORKER-01 | WP-WORKER-01: model opus, effort high (изменение промпта протокола и адаптера ASR на проде, регрессия без контекста обязана совпадать байт-в-байт) | orch.py model |
| 2026-10-07 16:36Z | WP-BACKEND-06 | WP-BACKEND-06: model opus, effort high (контракт всей программы: схема БД с бэкфиллами на проде, общие типы для 10 пакетов, автоподключение) | orch.py model |
| 2026-10-07 16:33Z | WP-WORKER-MEMORY-01 | WP-WORKER-MEMORY-01 created (DRAFT) | work-packages/WP-WORKER-MEMORY-01-pipeline.md |
| 2026-10-07 16:32Z | WP-API-MEMORY-01 | WP-API-MEMORY-01 created (DRAFT) | work-packages/WP-API-MEMORY-01-registry.md |
| 2026-10-07 16:32Z | WP-API-FEEDBACK-01 | WP-API-FEEDBACK-01 created (DRAFT) | work-packages/WP-API-FEEDBACK-01-feedback.md |
| 2026-10-07 16:32Z | WP-API-PROJECTS-01 | WP-API-PROJECTS-01 created (DRAFT) | work-packages/WP-API-PROJECTS-01-projects-context.md |
| 2026-10-07 16:32Z | WP-WORKER-02 | WP-WORKER-02: DRAFT -> CANCELLED (создан в неверном потоке; заменён WP-WORKER-MEMORY-01 (D-15)) | D-15 |
| 2026-10-07 16:32Z | WP-FRONTEND-05 | WP-FRONTEND-05: DRAFT -> CANCELLED (заменён WP-WEB-MEMORY-01 (D-15)) | D-15 |
| 2026-10-07 16:32Z | WP-FRONTEND-04 | WP-FRONTEND-04: READY -> CANCELLED (заменён WP-WEB-FEEDBACK-01 (D-15)) | D-15 |
| 2026-10-07 16:32Z | WP-FRONTEND-03 | WP-FRONTEND-03: READY -> CANCELLED (заменён WP-WEB-PROJECTS-01 (D-15)) | D-15 |
| 2026-10-07 16:32Z | WP-BACKEND-05 | WP-BACKEND-05: DRAFT -> CANCELLED (заменён WP-INFRA-01 и WP-WORKER-MEMORY-01 (D-15)) | D-15 |
| 2026-10-07 16:32Z | WP-BACKEND-04 | WP-BACKEND-04: DRAFT -> CANCELLED (заменён WP-API-MEMORY-01 (D-15, поток api-memory)) | D-15 |
| 2026-10-07 16:32Z | WP-BACKEND-03 | WP-BACKEND-03: READY -> CANCELLED (заменён WP-API-FEEDBACK-01 (D-15, поток api-feedback)) | D-15 |
| 2026-10-07 16:32Z | WP-BACKEND-02 | WP-BACKEND-02: READY -> CANCELLED (заменён WP-API-PROJECTS-01 (D-15, поток api-projects)) | D-15 |
| 2026-10-07 16:31Z | WP-WEB-MEMORY-01 | WP-WEB-MEMORY-01 created (DRAFT) | work-packages/WP-WEB-MEMORY-01-registry.md |
| 2026-10-07 16:31Z | WP-WEB-FEEDBACK-01 | WP-WEB-FEEDBACK-01 created (DRAFT) | work-packages/WP-WEB-FEEDBACK-01-feedback.md |
| 2026-10-07 16:31Z | WP-WEB-PROJECTS-01 | WP-WEB-PROJECTS-01 created (DRAFT) | work-packages/WP-WEB-PROJECTS-01-projects-context.md |
| 2026-10-07 16:31Z | WP-INFRA-01 | WP-INFRA-01 created (DRAFT) | work-packages/WP-INFRA-01-neo4j.md |
| 2026-10-07 16:31Z | WP-WORKER-02 | WP-WORKER-02 created (DRAFT) | work-packages/WP-WORKER-02-project-memory.md |
| 2026-10-07 16:31Z | WP-WORKER-01 | WP-WORKER-01 created (DRAFT) | work-packages/WP-WORKER-01-context-asr-llm.md |
| 2026-10-07 16:31Z | WP-BACKEND-06 | WP-BACKEND-06 created (DRAFT) | work-packages/WP-BACKEND-06-contract.md |
| 2026-10-07 16:31Z | — | D-15 recorded | — |
| 2026-10-07 16:27Z | — | R-1 opened for owner | work-packages/WP-BACKEND-05-neo4j-prod.md |
| 2026-10-07 16:27Z | WP-BACKEND-05 | WP-BACKEND-05 created (DRAFT) | work-packages/WP-BACKEND-05-neo4j-prod.md |
| 2026-10-07 16:27Z | — | P-12 closed | answered by D-14 |
| 2026-10-07 16:27Z | — | D-14 recorded | answer to P-12 |
| 2026-10-07 16:27Z | — | P-11 closed | answered by D-13 |
| 2026-10-07 16:27Z | — | D-13 recorded | answer to P-11 |
| 2026-10-07 16:23Z | WP-BACKEND-04 | WP-BACKEND-04: model opus, effort high (многошаговый LLM-пайплайн, сопоставление сущностей между встречами, машина статусов, миграция) | orch.py model |
| 2026-10-07 16:23Z | WP-FRONTEND-05 | WP-FRONTEND-05 created (DRAFT) | work-packages/WP-FRONTEND-05-project-memory-ui.md |
| 2026-10-07 16:23Z | WP-BACKEND-04 | WP-BACKEND-04 created (DRAFT) | work-packages/WP-BACKEND-04-project-memory.md |
| 2026-10-07 16:23Z | — | P-12 opened for owner | reports/research-2026-10-07-project-memory.md |
| 2026-10-07 16:23Z | — | P-11 opened for owner | reports/research-2026-10-07-project-memory.md |
| 2026-10-07 16:21Z | WP-FRONTEND-04 | WP-FRONTEND-04: DRAFT -> READY | разделы заполнены; решения D-6..D-12 закрыты |
| 2026-10-07 16:21Z | WP-BACKEND-03 | WP-BACKEND-03: DRAFT -> READY | разделы заполнены; решения D-6..D-12 закрыты |
| 2026-10-07 16:21Z | WP-FRONTEND-03 | WP-FRONTEND-03: DRAFT -> READY | разделы заполнены; решения D-6..D-12 закрыты |
| 2026-10-07 16:21Z | WP-BACKEND-02 | WP-BACKEND-02: DRAFT -> READY | разделы заполнены; решения D-6..D-12 закрыты |
| 2026-10-07 16:21Z | WP-FRONTEND-02 | WP-FRONTEND-02: DRAFT -> READY | разделы заполнены; решения D-6..D-12 закрыты |
| 2026-10-07 16:21Z | WP-BACKEND-01 | WP-BACKEND-01: DRAFT -> READY | разделы заполнены; решения D-6..D-12 закрыты |
| 2026-10-07 16:19Z | — | Q-3 recorded | — |
| 2026-10-07 16:19Z | — | A-3 recorded | — |
| 2026-10-07 16:19Z | — | P-10 closed | answered by D-12 |
| 2026-10-07 16:19Z | — | D-12 recorded | answer to P-10 |
| 2026-10-07 16:19Z | — | P-9 closed | answered by D-11 |
| 2026-10-07 16:19Z | — | D-11 recorded | answer to P-9 |
| 2026-10-07 16:19Z | — | P-8 closed | answered by D-10 |
| 2026-10-07 16:19Z | — | D-10 recorded | answer to P-8 |
| 2026-10-07 16:19Z | — | P-7 closed | answered by D-9 |
| 2026-10-07 16:19Z | — | D-9 recorded | answer to P-7 |
| 2026-10-07 16:19Z | — | P-6 closed | answered by D-8 |
| 2026-10-07 16:19Z | — | D-8 recorded | answer to P-6 |
| 2026-10-07 16:19Z | — | P-5 closed | answered by D-7 |
| 2026-10-07 16:19Z | — | D-7 recorded | answer to P-5 |
| 2026-10-07 16:19Z | — | P-4 closed | answered by D-6 |
| 2026-10-07 16:19Z | — | D-6 recorded | answer to P-4 |
| 2026-10-07 16:12Z | WP-FRONTEND-01 | WP-FRONTEND-01: DRAFT -> READY | разделы заполнены; не зависит от открытых P-n (D-5) |
| 2026-10-07 16:12Z | WP-BACKEND-03 | WP-BACKEND-03: model opus, effort high (миграция с бэкфиллом протоколов, разбор docx, изоляция) | orch.py model |
| 2026-10-07 16:12Z | WP-BACKEND-02 | WP-BACKEND-02: model opus, effort high (контракт между модулями, изменение пайплайна (статус ожидания запуска), миграция, промпт) | orch.py model |
| 2026-10-07 16:12Z | WP-BACKEND-01 | WP-BACKEND-01: model opus, effort high (права доступа, изоляция данных, миграция с бэкфиллом на проде) | orch.py model |
| 2026-10-07 16:09Z | — | P-10 opened for owner | PLAN.md |
| 2026-10-07 16:09Z | — | P-9 opened for owner | PLAN.md |
| 2026-10-07 16:09Z | — | P-8 opened for owner | PLAN.md |
| 2026-10-07 16:09Z | — | P-7 opened for owner | PLAN.md |
| 2026-10-07 16:09Z | — | P-6 opened for owner | PLAN.md |
| 2026-10-07 16:09Z | — | P-5 opened for owner | PLAN.md |
| 2026-10-07 16:09Z | — | P-4 opened for owner | PLAN.md |
| 2026-10-07 16:09Z | — | Q-2 recorded | — |
| 2026-10-07 16:09Z | — | Q-1 recorded | — |
| 2026-10-07 16:09Z | — | A-2 recorded | — |
| 2026-10-07 16:09Z | — | A-1 recorded | — |
| 2026-10-07 16:09Z | — | D-5 recorded | — |
| 2026-10-07 16:08Z | WP-FRONTEND-04 | WP-FRONTEND-04 created (DRAFT) | work-packages/WP-FRONTEND-04-feedback-ui.md |
| 2026-10-07 16:08Z | WP-BACKEND-03 | WP-BACKEND-03 created (DRAFT) | work-packages/WP-BACKEND-03-feedback.md |
| 2026-10-07 16:08Z | WP-FRONTEND-03 | WP-FRONTEND-03 created (DRAFT) | work-packages/WP-FRONTEND-03-projects-context-ui.md |
| 2026-10-07 16:08Z | WP-BACKEND-02 | WP-BACKEND-02 created (DRAFT) | work-packages/WP-BACKEND-02-projects-context.md |
| 2026-10-07 16:08Z | WP-FRONTEND-02 | WP-FRONTEND-02 created (DRAFT) | work-packages/WP-FRONTEND-02-login-tasks.md |
| 2026-10-07 16:08Z | WP-FRONTEND-01 | WP-FRONTEND-01 created (DRAFT) | work-packages/WP-FRONTEND-01-design-system.md |
| 2026-10-07 16:08Z | WP-BACKEND-01 | WP-BACKEND-01 created (DRAFT) | work-packages/WP-BACKEND-01-auth-workspaces.md |
| 2026-10-07 15:49Z | — | delivery stand: orchestrator by D-4 | D-4 |
| 2026-10-07 15:49Z | — | delivery merge: orchestrator by D-4 | D-4 |
| 2026-10-07 15:48Z | — | D-4 recorded | — |
| 2026-10-07 15:48Z | — | P-3 closed | answered by D-3 |
| 2026-10-07 15:48Z | — | D-3 recorded | answer to P-3 |
| 2026-10-07 15:48Z | — | P-2 closed | answered by D-2 |
| 2026-10-07 15:48Z | — | D-2 recorded | answer to P-2 |
| 2026-10-07 15:48Z | — | P-1 closed | answered by D-1 |
| 2026-10-07 15:48Z | — | D-1 recorded | answer to P-1 |
| 2026-10-07 15:45Z | — | P-3 opened for owner | orch.yaml |
| 2026-10-07 15:44Z | — | P-2 opened for owner | orch.yaml |
| 2026-10-07 15:44Z | — | P-1 opened for owner | orch.py init |
| 2026-10-07 15:44Z | — | permission mode: bypassPermissions, confirmed by the owner | orch.py init |
| 2026-10-07 15:44Z | — | session kind: local, confirmed by the owner | orch.py init |
| 2026-10-07 15:44Z | — | workspace created (ru) | orch.py init |
