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
| [WP-BACKEND-01](work-packages/WP-BACKEND-01-auth-workspaces.md) | backend | Вход по PIN, рабочие пространства и изоляция данных (API+worker) | PROD | product-backend | https://github.com/ITSalt/transcriber/pull/15 (accepted ba75536568) | 2026-10-08 |
| [WP-FRONTEND-01](work-packages/WP-FRONTEND-01-design-system.md) | frontend | Дизайн-система ITSALT и каркас приложения | PROD | product-frontend | https://github.com/ITSalt/transcriber/pull/9 (accepted 364b6b9fb8) | 2026-10-07 |
| [WP-FRONTEND-02](work-packages/WP-FRONTEND-02-login-tasks.md) | frontend | Экран входа, переключатель пространств, список задач | PROD | product-frontend | https://github.com/ITSalt/transcriber/pull/13 (accepted 4b4d74a970) | 2026-10-08 |
| [WP-BACKEND-02](work-packages/WP-BACKEND-02-projects-context.md) | backend | Проекты и контекст встречи: в распознавание и в протокол | CANCELLED (заменён WP-API-PROJECTS-01 (D-15, поток api-projects)) | product-backend | — | 2026-10-07 |
| [WP-FRONTEND-03](work-packages/WP-FRONTEND-03-projects-context-ui.md) | frontend | Проекты и форма контекста перед распознаванием | CANCELLED (заменён WP-WEB-PROJECTS-01 (D-15)) | product-frontend | — | 2026-10-07 |
| [WP-BACKEND-03](work-packages/WP-BACKEND-03-feedback.md) | backend | История версий протокола и приём обратной связи | CANCELLED (заменён WP-API-FEEDBACK-01 (D-15, поток api-feedback)) | product-backend | — | 2026-10-07 |
| [WP-FRONTEND-04](work-packages/WP-FRONTEND-04-feedback-ui.md) | frontend | Режим обратной связи по протоколу | CANCELLED (заменён WP-WEB-FEEDBACK-01 (D-15)) | product-frontend | — | 2026-10-07 |
| [WP-BACKEND-04](work-packages/WP-BACKEND-04-project-memory.md) | backend | Память проекта: граф задач и решений, сводка, перенос между встречами | CANCELLED (заменён WP-API-MEMORY-01 (D-15, поток api-memory)) | product-backend | — | 2026-10-07 |
| [WP-FRONTEND-05](work-packages/WP-FRONTEND-05-project-memory-ui.md) | frontend | Реестр задач и решений проекта, очередь подтверждений | CANCELLED (заменён WP-WEB-MEMORY-01 (D-15)) | product-frontend | — | 2026-10-07 |
| [WP-BACKEND-05](work-packages/WP-BACKEND-05-neo4j-prod.md) | backend | Neo4j для памяти проекта: сервис, лимиты памяти, бэкап, CI | CANCELLED (заменён WP-INFRA-01 и WP-WORKER-MEMORY-01 (D-15)) | product-backend | — | 2026-10-07 |
| [WP-BACKEND-06](work-packages/WP-BACKEND-06-contract.md) | backend | Контракт программы: схема БД, контракты shared, зависимости | PROD | product-backend | https://github.com/ITSalt/transcriber/pull/12 (accepted 3fa3500f47) | 2026-10-07 |
| [WP-WORKER-01](work-packages/WP-WORKER-01-context-asr-llm.md) | worker | Контекст встречи в Deepgram и в промпт протокола, метаданные генерации | PROD | product-worker | https://github.com/ITSalt/transcriber/pull/17 (accepted d0728e2380) | 2026-10-08 |
| [WP-WORKER-02](work-packages/WP-WORKER-02-project-memory.md) | worker | Память проекта в Neo4j: извлечение, сопоставление, сводка | CANCELLED (создан в неверном потоке; заменён WP-WORKER-MEMORY-01 (D-15)) | product-worker | — | 2026-10-07 |
| [WP-INFRA-01](work-packages/WP-INFRA-01-neo4j.md) | infra | Neo4j памяти проекта: сервис, лимиты, бэкап, CI, шаг деплоя | PROD | product-infra | https://github.com/ITSalt/transcriber/pull/10 (accepted 0e7ebe85d3) | 2026-10-07 |
| [WP-WEB-PROJECTS-01](work-packages/WP-WEB-PROJECTS-01-projects-context.md) | web-projects | Проекты и форма контекста перед распознаванием | PROD | product-web-projects | https://github.com/ITSalt/transcriber/pull/19 (accepted 79d01c1853) | 2026-10-08 |
| [WP-WEB-FEEDBACK-01](work-packages/WP-WEB-FEEDBACK-01-feedback.md) | web-feedback | Режим обратной связи по протоколу | PROD | product-web-feedback | https://github.com/ITSalt/transcriber/pull/18 (accepted 79cca617f4) | 2026-10-08 |
| [WP-WEB-MEMORY-01](work-packages/WP-WEB-MEMORY-01-registry.md) | web-memory | Реестр задач и решений проекта, очередь подтверждений | PROD | product-web-memory | https://github.com/ITSalt/transcriber/pull/14 (accepted bd0ce7d0c5) | 2026-10-08 |
| [WP-API-PROJECTS-01](work-packages/WP-API-PROJECTS-01-projects-context.md) | api-projects | API проектов и контекста встречи, запуск распознавания | PROD | product-api-projects | https://github.com/ITSalt/transcriber/pull/20 (accepted 109c71f00f) | 2026-10-08 |
| [WP-API-FEEDBACK-01](work-packages/WP-API-FEEDBACK-01-feedback.md) | api-feedback | API версий протокола и обратной связи, разбор docx | PROD | product-api-feedback | https://github.com/ITSalt/transcriber/pull/21 (accepted e420bd0f93) | 2026-10-08 |
| [WP-API-MEMORY-01](work-packages/WP-API-MEMORY-01-registry.md) | api-memory | API памяти проекта: задачи, решения, подтверждения | PROD | product-api-memory | https://github.com/ITSalt/transcriber/pull/23 (accepted fb632c5091) | 2026-10-08 |
| [WP-WORKER-MEMORY-01](work-packages/WP-WORKER-MEMORY-01-pipeline.md) | worker-memory | Память проекта в Neo4j: слой графа, извлечение, сопоставление, сводка | PROD | product-worker-memory | https://github.com/ITSalt/transcriber/pull/16 (accepted 69f3715e3d) | 2026-10-08 |
| [WP-INFRA-02](work-packages/WP-INFRA-02-deploy-migrate-first.md) | infra | Порядок деплоя: миграции Postgres до сборки и замены dist | PROD | product-infra | https://github.com/ITSalt/transcriber/pull/11 (accepted 6694e5e172) | 2026-10-07 |
| [WP-INFRA-03](work-packages/WP-INFRA-03-neo4j-ports.md) | infra | Порты Neo4j памяти проекта 7476/7689 (D-26) | PROD | product-infra | https://github.com/ITSalt/transcriber/pull/22 (accepted 5d27d4a320) | 2026-10-08 |

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
| ~~R-6~~ | ~~Освободить диск прод-VM, шаг 3: удалить кэш скачанных snap-пакетов (snapd пересоздаёт его сам, установленные snap не трогаются) и посмотреть, что в /home/deploy/.local/share : ssh deploy@transcriber.itsalt.ru 'sudo rm -rf /var/lib/snapd/cache/*; sudo du -xh --max-depth=2 /home/deploy/.local/share \| sort -h \| tail -6; df -h /' ; expected: около 3 GB освобождено, df покажет примерно 10.5 GB свободно (цель 8 GB достигнута), топ-6 подкаталогов .local/share ; then: оркестратор закроет тему диска или даст точечный шаг по .local/share (обычно pnpm store)~~ | work-packages/WP-INFRA-01-neo4j.md | 2026-10-07 | 2026-10-07: ssh 2026-10-07: sudo rm -rf /var/lib/snapd/cache/* выполнен; df /: 21G used, 7.4G avail (75%) — видимого выигрыша нет (вероятно, кэш был уже меньше или файлы ещё удерживались); /home/deploy/.local/share/pnpm/store = 2.0G |
| ~~P-13~~ | ~~Поведение деплоя после включения Neo4j памяти (MEMORY_NEO4J_URI задан): шаг graph:migrate в deploy-production.yml сейчас фатальный и стоит после миграций Postgres, но до rsync и pm2 — при падении Neo4j (например, OOM-перезапуск) любой деплой несвязанных изменений остановится в полусостоянии (схема Postgres новая, процессы старые). Варианты: (a) оставить фатальным, как db:migrate:deploy; (b) сделать шаг нефатальным: ошибка печатается ::error::, деплой продолжается, воркер обязан работать без графа (деградация), владельцу — пункт на ручной graph:migrate; (c) перенести шаг после pm2 start. Рекомендую (b): память проекта — вспомогательная подсистема, она не должна блокировать выкладку исправлений основного продукта; требование деградации уже заложено в WP-WORKER-MEMORY-01~~ | reports/wp-infra-01-review-20261007.md | 2026-10-07 | 2026-10-07: answered by D-19 |
| ~~R-7~~ | ~~Какие .env есть на прод-VM (шаг деплоя читает /opt/transcrib/.env, а pm2 и воркер — api/.env и worker/.env; если корневого .env нет, шаг graph:migrate будет молча пропускаться) : ssh deploy@transcriber.itsalt.ru 'ls -la /opt/transcrib/.env /opt/transcrib/api/.env /opt/transcrib/worker/.env 2>&1; ls -la /opt/transcrib/ecosystem.config.cjs' ; expected: какие из трёх файлов существуют (содержимое не нужно) ; then: оркестратор впишет точный файл в README-neo4j и в пункт REVISE WP-INFRA-01~~ | reports/wp-infra-01-review-20261007.md | 2026-10-07 | 2026-10-07: ssh 2026-10-07: /opt/transcrib/.env — обычный файл (1285 B, 0600); /opt/transcrib/api/.env и /opt/transcrib/worker/.env — симлинки на ../.env; ecosystem.config.cjs есть. Все три читателя (compose, шаг деплоя, воркер/graph:migrate) видят один и тот же файл; таблица в README-neo4j верна, править не нужно |
| ~~R-8~~ | ~~Бэкап БД прода перед merge WP-BACKEND-06 — блокирует доставку (D-4: пакет с миграцией; первая миграция программы с бэкфиллами): ssh deploy@transcriber.itsalt.ru 'cd /opt/transcrib/api && set -a && . ./.env && set +a && mkdir -p ~/backup && pg_dump "$DATABASE_URL" -Fc -f ~/backup/transcrib-before-backend06-$(date +%Y%m%d-%H%M).dump && ls -la ~/backup \| tail -3 && df -h / \| tail -1' ; expected: файл transcrib-before-backend06-<дата>.dump ненулевого размера в /home/deploy/backup, свободное место на диске не ниже 6 GB ; then: оркестратор сверит имя и размер файла, закроет пункт и выполнит доставку после ACCEPTED~~ | work-packages/WP-BACKEND-06-contract.md | 2026-10-07 | 2026-10-07 dropped: на хосте нет pg_dump: Postgres прода живёт в контейнере learn-postgres (PG 17.9, .tl/deploy-plan.md:17); заменён на R-9 через docker exec |
| ~~R-9~~ | ~~Бэкап БД прода перед merge WP-BACKEND-06 — блокирует доставку (D-4; Postgres в контейнере learn-postgres, PG 17.9, БД transcrib): ssh deploy@transcriber.itsalt.ru 'mkdir -p ~/backup && docker exec learn-postgres pg_dump -U postgres -d transcrib -Fc > ~/backup/transcrib-before-backend06-$(date +%Y%m%d-%H%M).dump && ls -la ~/backup \| tail -3 && df -h / \| tail -1' ; expected: файл transcrib-before-backend06-<дата>.dump ненулевого размера (сотни KB — единицы MB), свободно на диске не меньше 6 GB ; then: оркестратор сверит имя и размер, закроет пункт и доставит BACKEND-06 после ACCEPTED (восстановление, если понадобится: docker exec -i learn-postgres pg_restore -U postgres -d transcrib --clean --if-exists < файл)~~ | work-packages/WP-BACKEND-06-contract.md | 2026-10-07 | 2026-10-07: ssh 2026-10-07 22:44 (время VM): docker exec learn-postgres pg_dump -U postgres -d transcrib -Fc → /home/deploy/backup/transcrib-before-backend06-20261007-2244.dump, 943839 байт; df /: 7.4G avail |
| ~~R-10~~ | ~~Освободить диск прод-VM, шаг 4 (последний): ужать pnpm store (удаляет только пакеты, на которые не ссылается ни один node_modules; деплой их переустановит при необходимости) и проверить, что осталось в кэше snap : ssh deploy@transcriber.itsalt.ru 'bash -lc "pnpm store prune"; sudo du -sh /var/lib/snapd/cache; sudo snap list --all \| grep -c disabled; df -h /' ; expected: pnpm сообщит число удалённых пакетов, кэш snap близок к нулю, df ≈ 8–9 GB свободно ; then: оркестратор закрывает тему диска (цель 8 GB) или оставляет её в backlog, если выигрыш мал~~ | work-packages/WP-INFRA-01-neo4j.md | 2026-10-07 | 2026-10-07: ssh 2026-10-07: pnpm не в PATH неинтерактивного ssh (живёт в nvm, деплой грузит nvm.sh явно); /var/lib/snapd/cache всё ещё 3.3G — rm с глобом под sudo не удалил (глоб раскрывает non-root shell); 6 выключенных ревизий snap; df 7.4G avail |
| ~~R-11~~ | ~~Освободить диск прод-VM, шаг 4 (повтор с исправленными командами): кэш snap удаляется под root целиком, выключенные ревизии snap удаляются, pnpm грузится через nvm как в деплое : ssh deploy@transcriber.itsalt.ru 'sudo sh -c "rm -rf /var/lib/snapd/cache/*"; sudo snap list --all \| awk "/disabled/{print \$1, \$3}" \| while read n r; do sudo snap remove "$n" --revision="$r"; done; export NVM_DIR=$HOME/.nvm; . $NVM_DIR/nvm.sh; nvm use 22 >/dev/null; pnpm store prune \| tail -2; sudo du -sh /var/lib/snapd/cache; df -h / \| tail -1' ; expected: кэш snap ~0, несколько строк «<snap> (revision N) removed», pnpm сообщит число удалённых пакетов, df ≈ 10–11 GB свободно ; then: оркестратор закрывает тему диска~~ | work-packages/WP-INFRA-01-neo4j.md | 2026-10-07 | 2026-10-07: ssh 2026-10-07: кэш snap 4.0K, удалены 6 выключенных ревизий snap, pnpm store prune: 2910 файлов / 37 пакетов; df /: 19G used, 10G avail (65%) — цель 8 GB достигнута |
| ~~P-14~~ | ~~Блокировка входа по PIN (D-8): сейчас 10 неудачных попыток с одного IP накапливаются навсегда, успешный вход их не сбрасывает (сброс при успехе позволил бы владельцу любого PIN перебирать чужие бесконечно), снимает только ваша CLI-команда user:unblock. Варианты: (a) так и оставить — проще и безопаснее всего, редкий честный пользователь, 10 раз ошибившийся с одного IP за месяцы, пишет вам; (b) неудачи старше 30 дней не считать — честных блокировок почти не будет, перебор получает 10 попыток в месяц с IP (при 10⁶ PIN — безопасно); (c) сбрасывать при успешном входе — отвергнуто, открывает перебор. Рекомендую (a) сейчас, (b) — если за первый месяц будут жалобы; ответ не блокирует пакет~~ | work-packages/WP-BACKEND-01-auth-workspaces.md | 2026-10-07 | 2026-10-08: answered by D-23 |
| ~~R-12~~ | ~~Бэкап БД прода перед merge WP-BACKEND-01 — блокирует доставку (D-4: миграция NOT NULL на meetings.workspace_id + сверка версий протоколов): ssh deploy@transcriber.itsalt.ru 'docker exec learn-postgres pg_dump -U postgres -d transcrib -Fc > ~/backup/transcrib-before-backend01-$(date +%Y%m%d-%H%M).dump && ls -la ~/backup \| tail -2 && df -h / \| tail -1' ; expected: файл transcrib-before-backend01-<дата>.dump ненулевого размера ; then: оркестратор закроет пункт и доставит BACKEND-01 после ACCEPTED (делать непосредственно перед merge, после вердикта)~~ | work-packages/WP-BACKEND-01-auth-workspaces.md | 2026-10-07 | 2026-10-08: 2026-10-08 13:08 VM: ~/backup/transcrib-before-backend01-20261008-1308.dump 1019118 байт; / 9.9G свободно |
| ~~P-15~~ | ~~Архив промптов протокола в S3 (WP-WORKER-01, RQ-061): файлы ws/<workspace>/prompts/<id>.txt попадают под 3-дневный lifecycle прод-бакета (.tl/deploy-plan.md) и исчезнут через 3 дня. Варианты: (a) оставить — архив нужен только для разбора свежих жалоб на протокол; (b) добавить исключение lifecycle для префикса ws/*/prompts/ (хранить, например, 90 дней) — это настройка бакета в консоли Cloud.ru, не код. Рекомендую (a) сейчас; (b) — когда появится обратная связь по протоколам (WEB-FEEDBACK), чтобы аналитик видел промпт~~ | reports/wp-worker-01-review-20261007.md | 2026-10-07 | 2026-10-08: answered by D-24 |
| ~~P-16~~ | ~~Размер «предыдущего протокола» в контексте встречи (WP-WORKER-01, L4): пользователь может вставить/загрузить до 200 000 символов, и вместе с длинным транскриптом промпт превысит окно модели; kie.ai ответит 400 — постоянная ошибка, встреча станет FAILED с кнопкой «Повторить» без шансов. Варианты: (a) бюджет в рендерере: обрезать <previous_protocol> до N символов (например, 30 000) с пометкой «обрезано»; (b) ограничить размер поля на API/форме (API-PROJECTS-01, WEB-PROJECTS-01); (c) оба. Рекомендую (c): лимит на форме 50 000 символов + страховочная обрезка в воркере; делается небольшими правками в пакетах волны 3 (API-PROJECTS-01) и follow-up воркера~~ | reports/wp-worker-01-review-20261007.md | 2026-10-07 | 2026-10-08: answered by D-25 |
| ~~R-13~~ | ~~Запустить Neo4j памяти проекта на прод-VM (нужно до доставки WP-WORKER-MEMORY-01; не срочно, но пароль задаётся ДО первого старта): ssh deploy@transcriber.itsalt.ru 'cd /opt/transcrib && PW=$(openssl rand -hex 24) && printf "\nMEMORY_NEO4J_URI=bolt://127.0.0.1:7688\nMEMORY_NEO4J_USER=neo4j\nMEMORY_NEO4J_PASS…=<пароль>\nMEMORY_NEO4J_DATABASE=neo4j\n" "$PW" >> .env && chmod 600 .env && docker compose up -d memory-neo4j && sleep 60 && docker compose ps memory-neo4j && docker inspect -f "{{.HostConfig.Memory}}" $(docker compose ps -q memory-neo4j) && free -h \| head -2' ; expected: контейнер memory-neo4j healthy, Memory=1610612736, свободная память VM не ниже ~1 GB; пароль не присылать — он остаётся только в /opt/transcrib/.env (симлинки api/.env и worker/.env ведут на него) ; then: оркестратор проверит ответ /api/health, следующий деплой выполнит graph:migrate, и WORKER-MEMORY-01 можно доставлять~~ | work-packages/WP-WORKER-MEMORY-01-pipeline.md | 2026-10-07 | 2026-10-07 dropped: текст пункта споткнул линт о секреты (строка вида PASSWORD=…); заменён на R-14 с той же сутью |
| ~~R-14~~ | ~~Запустить Neo4j памяти проекта на прод-VM (нужно до доставки WP-WORKER-MEMORY-01; пароль задаётся ДО первого старта контейнера): ssh deploy@transcriber.itsalt.ru 'cd /opt/transcrib && PW=$(openssl rand -hex 24) && { echo; echo MEMORY_NEO4J_URI=bolt://127.0.0.1:7688; echo MEMORY_NEO4J_USER=neo4j; echo MEMORY_NEO4J_PASS"WORD=$PW"; echo MEMORY_NEO4J_DATABASE=neo4j; } >> .env && chmod 600 .env && docker compose up -d memory-neo4j && sleep 60 && docker compose ps memory-neo4j && docker inspect -f "{{.HostConfig.Memory}}" $(docker compose ps -q memory-neo4j) && free -h \| head -2' ; expected: memory-neo4j healthy, Memory=1610612736, свободно на VM не меньше ~1 GB; пароль остаётся только в /opt/transcrib/.env (api/.env и worker/.env — симлинки на него), присылать не нужно ; then: оркестратор проверит health API, следующий деплой выполнит graph:migrate, WORKER-MEMORY-01 можно доставлять~~ | work-packages/WP-WORKER-MEMORY-01-pipeline.md | 2026-10-07 | 2026-10-08 dropped: заменяется после доставки WP-INFRA-03 (порты 7476/7689, D-26); переменные в .env уже дописаны, URI будет исправлен новым пунктом |
| ~~R-15~~ | ~~Диагностика занятого порта 7475 на прод-VM (R-14 упал: Bind for 127.0.0.1:7475 failed; переменные MEMORY_NEO4J_* в /opt/transcrib/.env уже дописаны — повторно команду R-14 НЕ выполнять): ssh deploy@transcriber.itsalt.ru 'sudo ss -ltnp \| grep -E ":7475\|:7688"; docker ps --format "{{.Names}} {{.Ports}}" \| grep -E "747\|768"; grep -c MEMORY_NEO4J_ /opt/transcrib/.env' ; expected: строка с процессом/контейнером на 7475 и число 4 (переменные дописаны один раз) ; then: оркестратор предложит смену порта браузера memory-neo4j в compose (пакет INFRA-03) или остановку конфликтующего сервиса~~ | work-packages/WP-WORKER-MEMORY-01-pipeline.md | 2026-10-08 | 2026-10-08: 2026-10-08 ssh learn-prod: 127.0.0.1:7475 и :7688 слушает docker-proxy контейнера fc-neo4j (7475->7474, 7688->7687); MEMORY_NEO4J_ в /opt/transcrib/.env = 4 строки (дописаны один раз); свободно 4.6 GiB |
| ~~R-16~~ | ~~Включить вход по PIN (после FRONTEND-02 в проде; не блокирует доставку; делать, когда готовы — до этого всё работает как раньше в пространстве «Роман»). Три шага на VM (api/.env — симлинк на /opt/transcrib/.env): (1) ssh deploy@transcriber.itsalt.ru 'cd /opt/transcrib && echo PIN_PEPPER=cf4bba3deff4e0ae4a8a8d97bf2007fc4b17e00314ba3b96bec6afad5cfbc383 >> .env && grep -c ^PIN_PEPPER= .env' → 1 ; (2) ssh -t deploy@transcriber.itsalt.ru 'cd /opt/transcrib && pnpm --filter @transcrib/api run user:create -- --name "Роман" --pin <6 цифр> --workspace "Роман"' → пользователь создан, PIN в выводе не печатается; при необходимости ещё пользователи той же командой; (3) ssh deploy@transcriber.itsalt.ru 'cd /opt/transcrib && sed -i "s/^AUTH_REQUIRED=.*/AUTH_REQUIRED=true/" .env && grep -q ^AUTH_REQUIRED=true .env \|\| echo AUTH_REQUIRED=true >> .env; pm2 restart transcrib-api && sleep 5 && curl -s -o /dev/null -w "%{http_code}" https://transcriber.itsalt.ru/api/meetings' → 401 ; then: откройте https://transcriber.itsalt.ru — экран PIN; оркестратор проверит /me без cookie → 401 и закроет пункт. Откат: AUTH_REQUIRED=false + pm2 restart transcrib-api~~ | work-packages/WP-FRONTEND-02-login-tasks.md | 2026-10-08 | 2026-10-08: выполнено оркестратором по D-28 2026-10-08: PIN_PEPPER добавлен в /opt/transcrib/.env; user:create → Роман (f5fc588d…) в пространстве «Роман»; AUTH_REQUIRED=true, pm2 restart transcrib-api (online); проверки: health 200, /api/meetings и /api/auth/me без cookie 401, login верным PIN 200 + cookie, /me 200, неверный PIN 401 INVALID_PIN, logout 204 → /me 401 |
| ~~P-17~~ | ~~Отзывы на протокол (WP-API-FEEDBACK-01, DEC-012/RQ-065): сессия решила, что отзыв принимает только вошедший пользователь — при выключенном входе (AUTH_REQUIRED=false, сейчас на проде) кнопка «Отзыв» получит 401 и обратная связь не заработает до R-16. Варианты: (a) оставить — включить вход (R-16) до доставки WEB-FEEDBACK-01, отзывы всегда с автором; (b) при легаси-принципале записывать отзыв от синтетического «Романа» (nullable/служебный user_id) — работает без входа, но автор условный и схема сложнее. Рекомендую (a): R-16 всё равно в очереди, а WEB-FEEDBACK-01 доставляется после API-FEEDBACK-01. Ответ нужен до доставки WEB-FEEDBACK-01; при (a) R-16 становится условием её доставки~~ | reports/wp-api-feedback-01-review-20261008.md | 2026-10-08 | 2026-10-08: answered by D-27 |
| ~~P-18~~ | ~~Порты Neo4j памяти проекта: compose Transcrib (memory-neo4j 127.0.0.1:7475/7688) целиком конфликтует с контейнером fc-neo4j другого проекта на той же VM, а MEMORY_NEO4J_URI в /opt/transcrib/.env сейчас указывает на 7688 = fc-neo4j (чужой граф; пароль случайный, подключение упадёт по auth, но адрес нужно исправить). Варианты: (a) сменить порты Transcrib на 127.0.0.1:7476/7689 — маленький пакет INFRA-03 (docker-compose.yml, scripts/README-neo4j.md, .tl/deploy-plan.md §9, .env.example), затем вы правите MEMORY_NEO4J_URI=bolt://127.0.0.1:7689 в .env и запускаете memory-neo4j (новый R-14 без дописывания .env); (b) остановить fc-neo4j, если он больше не нужен — тогда ничего в коде не меняется, R-14 повторяется как есть; (c) общий Neo4j с fc — нет: community edition одна БД, чужие данные. Рекомендую (a), если fc-neo4j нужен; (b), если нет. Доставка WORKER-MEMORY-01/WEB-MEMORY-01 и запуск API-MEMORY-01 ждут ответа~~ | work-packages/WP-WORKER-MEMORY-01-pipeline.md | 2026-10-08 | 2026-10-08: answered by D-26 |
| ~~R-17~~ | ~~Запуск Neo4j памяти на прод-VM после INFRA-03 (D-26, D-28 — выполняет оркестратор по ssh): MEMORY_NEO4J_URI в /opt/transcrib/.env → bolt://127.0.0.1:7689; docker compose up -d memory-neo4j; ожидание healthy; проверка cypher-shell RETURN 1; memory=1610612736 ; expected: healthy, 7476/7689 слушают, RETURN 1 ok ; then: доставка WORKER-MEMORY-01 (graph:migrate в её деплое)~~ | work-packages/WP-INFRA-03-neo4j-ports.md | 2026-10-08 | 2026-10-08: 2026-10-08 ssh learn-prod: URI → bolt://127.0.0.1:7689; docker compose up -d memory-neo4j → Recreated/Started, healthy через ~30 с; 127.0.0.1:7476 и :7689 слушают; HostConfig.Memory=1610612736; cypher-shell RETURN 1 → ok; свободно 3.8 GiB |
| ~~R-18~~ | ~~Условие завершения п. 2 — второй пользователь в отдельном пространстве для живой проверки изоляции на проде (все 14 пакетов в PROD; это первый из трёх живых случаев владельца): ssh -t deploy@transcriber.itsalt.ru 'cd /opt/transcrib && pnpm --filter @transcrib/api run user:create -- --name "Тест" --pin <6 цифр> --workspace "Тест"' ; expected: пользователь «Тест» создан в новом пространстве «Тест», PIN в выводе не печатается ; then: сообщите оркестратору этот PIN в чате (в файлы не пишется) — он проверит read-only: вход обоих, чужая встреча по id → 404 на GET/PUT/DELETE/PDF/SSE/скачивании, список задач «Тест» пуст; затем SELECT users/memberships~~ | PLAN.md | 2026-10-08 | 2026-10-08: 2026-10-08 по D-29 оркестратор создал по ssh пользователя «Тест» (261701bb…) в личном пространстве «Тест» (1ea36ef9…), user:create exit 0 (без --workspace: флаг только присоединяет к существующему); SELECT: 2 пользователя, 2 пространства. Живая проверка изоляции под сессией «Тест» (curl, read-only): свой список встреч и проектов 200 пусто; список по workspace «Роман» 404; встреча ff188189… «Романа»: GET, events (SSE), protocol/pdf, transcript/download, protocol/versions, feedback, memory-refs, PUT protocol — все 404; /api/projects?workspace_id=«Роман» 404; DELETE чужого проекта 404; task-events confirm/reject по неизвестному id 404 (api дошёл до Neo4j: не 503); logout 204 → /me 401. DELETE чужой встречи вживую не слался (при сломанной проверке уничтожил бы данные) — покрыт auth-isolation.db.test.ts в CI. Условие завершения п. 2 выполнено |
| R-19 | Условие завершения п. 3 — первая живая встреча с проектом и контекстом на проде (платно: Deepgram + kie.ai): в https://transcriber.itsalt.ru войти, «Проекты» → «Создать проект» (название, 2–3 участника с ролями, 3–5 терминов глоссария, описание), затем «Загрузить» → выбрать короткий файл (1–3 мин), в блоке «Контекст встречи» выбрать проект, тип и цель, повестку, дождаться загрузки и нажать «Начать распознавание»; дождаться «Протокол готов» ; expected: протокол готов, на карточке проекта появилась вкладка «Память» с задачами/решениями и счётчик «На проверку» (если есть PENDING) ; then: оркестратор проверит SELECT'ом снимок контекста и метаданные генерации (keyterms, модель, версия промпта), архив промпта в S3, граф памяти (Task/Decision/ProjectMemory) и API памяти под вашей сессией не трогая данных | PLAN.md | 2026-10-08 |  |
| R-20 | Условие завершения п. 4 — обратная связь трёх видов по протоколу живой встречи из R-19 (после неё): страница протокола → «Обратная связь» → (1) вкладка «Замечания»: текст + категория → «Отправить»; (2) «Правильный протокол»: вставить исправленный текст → «Отправить»; (3) «Word с комментариями»: загрузить .docx с 1–2 комментариями → «Отправить» ; expected: в «Отправленные отзывы» три записи, «История версий» по-прежнему показывает исходную сгенерированную версию ; then: оркестратор проверит SELECT'ом protocol_feedback (3 вида), разбор docx в JSON, файлы в S3 и неизменность исходной версии протокола | PLAN.md | 2026-10-08 |  |

## Замки

Общие пути и ресурсы репозитория; только держатель правит общий путь, пушит миграцию,
проверяет на стенде, запускает dev-стек на фиксированных портах. Держатель отдаёт замок
после merge или проверки. «Ждут» — пакеты в очереди на замок.

<!-- orch:locks -->
| Замок | Репозиторий | Держатель | С | Ждут | Примечание |
|-------|-------------|-----------|---|------|------------|

## Очередь слияний

При `merge_policy: sequential`: по одному; после каждого merge — зелёный деплой
стенда и health-check, затем rebase следующего пакета.

<!-- orch:merge -->
| # | Репозиторий | WP | PR | Rebase после | Статус |
|---|-------------|----|----|--------------|--------|
| 1 | transcriber | WP-FRONTEND-01 | https://github.com/ITSalt/transcriber/pull/9 | — | merged |
| 2 | transcriber | WP-INFRA-01 | https://github.com/ITSalt/transcriber/pull/10 | WP-FRONTEND-01 | merged |
| 3 | transcriber | WP-INFRA-02 | https://github.com/ITSalt/transcriber/pull/11 | — | merged |
| 4 | transcriber | WP-BACKEND-06 | https://github.com/ITSalt/transcriber/pull/12 | — | merged |
| 5 | transcriber | WP-FRONTEND-02 | https://github.com/ITSalt/transcriber/pull/13 | — | dropped |
| 6 | transcriber | WP-WEB-MEMORY-01 | https://github.com/ITSalt/transcriber/pull/14 | WP-FRONTEND-02 | dropped |
| 7 | transcriber | WP-WORKER-01 | https://github.com/ITSalt/transcriber/pull/17 | WP-WEB-MEMORY-01 | dropped |
| 8 | transcriber | WP-WORKER-MEMORY-01 | https://github.com/ITSalt/transcriber/pull/16 | WP-WORKER-01 | dropped |
| 9 | transcriber | WP-BACKEND-01 | https://github.com/ITSalt/transcriber/pull/15 | — | merged |
| 10 | transcriber | WP-FRONTEND-02 | https://github.com/ITSalt/transcriber/pull/13 | WP-BACKEND-01 | merged |
| 11 | transcriber | WP-WORKER-01 | https://github.com/ITSalt/transcriber/pull/17 | WP-FRONTEND-02 | merged |
| 12 | transcriber | WP-WORKER-MEMORY-01 | https://github.com/ITSalt/transcriber/pull/16 | WP-WORKER-01 | dropped |
| 13 | transcriber | WP-WEB-MEMORY-01 | https://github.com/ITSalt/transcriber/pull/14 | WP-WORKER-MEMORY-01 | dropped |
| 14 | transcriber | WP-API-FEEDBACK-01 | — | — | merged |
| 15 | transcriber | WP-WORKER-MEMORY-01 | — | WP-API-FEEDBACK-01 | dropped |
| 16 | transcriber | WP-WEB-MEMORY-01 | — | WP-WORKER-MEMORY-01 | dropped |
| 17 | transcriber | WP-API-PROJECTS-01 | — | WP-WEB-MEMORY-01 | merged |
| 18 | transcriber | WP-WEB-FEEDBACK-01 | — | WP-API-PROJECTS-01 | dropped |
| 19 | transcriber | WP-WEB-PROJECTS-01 | — | WP-WEB-FEEDBACK-01 | merged |
| 20 | transcriber | WP-WORKER-MEMORY-01 | — | WP-WEB-PROJECTS-01 | dropped |
| 21 | transcriber | WP-WEB-MEMORY-01 | — | WP-WORKER-MEMORY-01 | dropped |
| 22 | transcriber | WP-WEB-FEEDBACK-01 | — | WP-WEB-PROJECTS-01 | merged |
| 23 | transcriber | WP-WORKER-MEMORY-01 | — | WP-WEB-FEEDBACK-01 | dropped |
| 24 | transcriber | WP-WEB-MEMORY-01 | — | WP-WORKER-MEMORY-01 | dropped |
| 25 | transcriber | WP-INFRA-03 | — | WP-WEB-MEMORY-01 | merged |
| 26 | transcriber | WP-WORKER-MEMORY-01 | — | WP-INFRA-03 | merged |
| 27 | transcriber | WP-WEB-MEMORY-01 | — | WP-WORKER-MEMORY-01 | merged |
| 28 | transcriber | WP-API-MEMORY-01 | https://github.com/ITSalt/transcriber/pull/23 | — | merged |

## Журнал

Новые сверху. Одна строка на событие: время (UTC), WP, что произошло, чем подтверждено.

<!-- orch:journal -->
| Дата | WP | Событие | Подтверждение |
|------|----|---------|---------------|
| 2026-10-08 13:36Z | — | условие завершения п. 2 подтверждено на проде (R-18 закрыт по фактам, D-29); попутно доказана связь api↔Neo4j на проде: task-events по неизвестному id → 404, не 503 | curl под сессией «Тест» 2026-10-08 ~13:40Z; psql SELECT users/memberships/workspaces |
| 2026-10-08 13:36Z | — | R-18 closed | 2026-10-08 по D-29 оркестратор создал по ssh пользователя «Тест» (261701bb…) в личном пространстве «Тест» (1ea36ef9…), user:create exit 0 (без --workspace: флаг только присоединяет к существующему); SELECT: 2 пользователя, 2 пространства. Живая проверка изоляции под сессией «Тест» (curl, read-only): свой список встреч и проектов 200 пусто; список по workspace «Роман» 404; встреча ff188189… «Романа»: GET, events (SSE), protocol/pdf, transcript/download, protocol/versions, feedback, memory-refs, PUT protocol — все 404; /api/projects?workspace_id=«Роман» 404; DELETE чужого проекта 404; task-events confirm/reject по неизвестному id 404 (api дошёл до Neo4j: не 503); logout 204 → /me 401. DELETE чужой встречи вживую не слался (при сломанной проверке уничтожил бы данные) — покрыт auth-isolation.db.test.ts в CI. Условие завершения п. 2 выполнено |
| 2026-10-08 13:34Z | — | D-29 recorded | — |
| 2026-10-08 13:20Z | — | все 14 пакетов в PROD; close --check блокируют только живые случаи владельца R-18..R-20 (условие завершения п. 2–4) и перевод пакетов в DONE после них; PLAN.md: фраза условия завершения приведена к виду, который читает orch.py | orch.py close --check; PLAN.md «Условие завершения: …» |
| 2026-10-08 13:20Z | — | R-20 opened for owner | PLAN.md |
| 2026-10-08 13:20Z | — | R-19 opened for owner | PLAN.md |
| 2026-10-08 13:20Z | — | R-18 opened for owner | PLAN.md |
| 2026-10-08 13:17Z | WP-API-MEMORY-01 | WP-API-MEMORY-01: VERIFIED_TEST -> PROD | verify --env prod b17ab2303f: reports/verify-WP-API-MEMORY-01-prod-20261008.md |
| 2026-10-08 13:16Z | WP-API-MEMORY-01 | WP-API-MEMORY-01: MERGED -> VERIFIED_TEST | verify --env test b17ab2303f: reports/verify-WP-API-MEMORY-01-test-20261008.md |
| 2026-10-08 13:13Z | WP-API-MEMORY-01 | WP-API-MEMORY-01 merged in the merge queue | orch.py deliver: b17ab2303f |
| 2026-10-08 13:13Z | WP-API-MEMORY-01 | WP-API-MEMORY-01: ACCEPTED -> MERGED | gh pr merge --squash: b17ab2303f (https://github.com/ITSalt/transcriber/pull/23) |
| 2026-10-08 13:11Z | WP-API-MEMORY-01 | WP-API-MEMORY-01 queued for merge (sequential) | https://github.com/ITSalt/transcriber/pull/23 |
| 2026-10-08 13:11Z | WP-API-MEMORY-01 | WP-API-MEMORY-01: accepted at fb632c5091add0ba514eceb8196e1647d6fdef43 | report reports/wp-api-memory-01-review-20261008.md |
| 2026-10-08 13:11Z | WP-API-MEMORY-01 | WP-API-MEMORY-01: REVIEW -> ACCEPTED | fb632c5091; reports/wp-api-memory-01-review-20261008.md |
| 2026-10-08 12:54Z | WP-API-MEMORY-01 | resume: сверка с реальностью — расхождений нет: PR 23 open, CI pass на fb632c5, замков нет, очередь владельца пуста, все пакеты кроме API-MEMORY-01 в PROD; граф-контейнер спецификации был остановлен (exit 0), перезапущен для проверки графа (875 узлов); рецензент round 1 запущен | gh pr view 23; gh pr checks 23 (run 37777007848 pass); orch.py lock list/queue/worktrees; docker compose up в ~/projects/.graphs/transcriber |
| 2026-10-08 12:31Z | WP-API-MEMORY-01 | WP-API-MEMORY-01: DISPATCHING -> REVIEW | fb632c5091; report reports/wp-api-memory-01-review-20261008.md |
| 2026-10-08 12:31Z | WP-API-MEMORY-01 | lock transcriber:.tl/external-contracts/** released | orch.py lock |
| 2026-10-08 12:31Z | WP-API-MEMORY-01 | lock transcriber:graph released | orch.py lock |
| 2026-10-08 12:14Z | WP-API-MEMORY-01 | WP-API-MEMORY-01: LOCK graph + .tl/external-contracts/** выдан; A-10 (DELETE project outbox, memory-refs) | сообщение сессии |
| 2026-10-08 12:14Z | — | A-10 recorded | — |
| 2026-10-08 12:14Z | WP-API-MEMORY-01 | lock transcriber:.tl/external-contracts/** acquired | orch.py lock |
| 2026-10-08 12:14Z | WP-API-MEMORY-01 | lock transcriber:graph acquired | orch.py lock |
| 2026-10-08 12:03Z | WP-WEB-MEMORY-01 | WP-WEB-MEMORY-01 PROD: сборка с фичей memory, панель протокола цела; вкладка памяти — при доставке API-MEMORY-01 | reports/verify-WP-WEB-MEMORY-01-prod-20261008.md |
| 2026-10-08 12:01Z | WP-WEB-MEMORY-01 | WP-WEB-MEMORY-01: VERIFIED_TEST -> PROD | verify --env prod d97912108e: reports/verify-WP-WEB-MEMORY-01-prod-20261008.md |
| 2026-10-08 12:01Z | WP-WEB-MEMORY-01 | WP-WEB-MEMORY-01: MERGED -> VERIFIED_TEST | verify --env test d97912108e: reports/verify-WP-WEB-MEMORY-01-test-20261008.md |
| 2026-10-08 11:58Z | WP-WEB-MEMORY-01 | WP-WEB-MEMORY-01 merged in the merge queue | orch.py deliver: d97912108e |
| 2026-10-08 11:58Z | WP-WEB-MEMORY-01 | WP-WEB-MEMORY-01: ACCEPTED -> MERGED | gh pr merge --squash: d97912108e (https://github.com/ITSalt/transcriber/pull/14) |
| 2026-10-08 11:57Z | WP-WEB-MEMORY-01 | WP-WEB-MEMORY-01: ACCEPTED -> ACCEPTED | reports/wp-web-memory-01-review-20261008-r3.md: rebase, CI run 37773187401 pass на bd0ce7d0c5 |
| 2026-10-08 11:57Z | WP-WEB-MEMORY-01 | WP-WEB-MEMORY-01: accepted at bd0ce7d0c5119e9c6c4c1282965d9c762c3e5db6 | report reports/wp-web-memory-01-review-20261008-r3.md |
| 2026-10-08 11:55Z | WP-WEB-MEMORY-01 | WP-WEB-MEMORY-01: review round 3 started at bd0ce7d0c5 | reports/wp-web-memory-01-review-20261008-r3.md |
| 2026-10-08 11:55Z | WP-WORKER-MEMORY-01 | WP-WORKER-MEMORY-01 PROD: graph:migrate applied 1 (0→1), 12 constraints, воркер online | reports/verify-WP-WORKER-MEMORY-01-prod-20261008.md |
| 2026-10-08 11:54Z | WP-API-MEMORY-01 | WP-API-MEMORY-01: READY -> DISPATCHING | start command handed to the owner; model sonnet |
| 2026-10-08 11:54Z | WP-WORKER-MEMORY-01 | WP-WORKER-MEMORY-01: VERIFIED_TEST -> PROD | verify --env prod 39555b542b: reports/verify-WP-WORKER-MEMORY-01-prod-20261008.md |
| 2026-10-08 11:54Z | WP-WORKER-MEMORY-01 | WP-WORKER-MEMORY-01: MERGED -> VERIFIED_TEST | verify --env test 39555b542b: reports/verify-WP-WORKER-MEMORY-01-test-20261008.md |
| 2026-10-08 11:51Z | WP-WORKER-MEMORY-01 | WP-WORKER-MEMORY-01 merged in the merge queue; released transcriber:shared/**, transcriber:worker/package.json | orch.py deliver: 39555b542b |
| 2026-10-08 11:51Z | WP-WORKER-MEMORY-01 | WP-WORKER-MEMORY-01: ACCEPTED -> MERGED | gh pr merge --squash: 39555b542b (https://github.com/ITSalt/transcriber/pull/16) |
| 2026-10-08 11:50Z | WP-WORKER-MEMORY-01 | WP-WORKER-MEMORY-01: ACCEPTED -> ACCEPTED | reports/wp-worker-memory-01-review-20261008-r3.md: rebase, CI run 37772440650 pass на 69f3715e3d |
| 2026-10-08 11:50Z | WP-WORKER-MEMORY-01 | WP-WORKER-MEMORY-01: accepted at 69f3715e3d19caf24966e664636572da0b041794 | report reports/wp-worker-memory-01-review-20261008-r3.md |
| 2026-10-08 11:48Z | WP-WORKER-MEMORY-01 | WP-WORKER-MEMORY-01: review round 3 started at 69f3715e3d | reports/wp-worker-memory-01-review-20261008-r3.md |
| 2026-10-08 11:47Z | WP-INFRA-03 | WP-INFRA-03 PROD; R-17: memory-neo4j поднят на 7476/7689, healthy, cypher ok; graph:migrate — при деплое WORKER-MEMORY-01 | reports/verify-WP-INFRA-03-prod-20261008.md |
| 2026-10-08 11:47Z | — | R-17 closed | 2026-10-08 ssh learn-prod: URI → bolt://127.0.0.1:7689; docker compose up -d memory-neo4j → Recreated/Started, healthy через ~30 с; 127.0.0.1:7476 и :7689 слушают; HostConfig.Memory=1610612736; cypher-shell RETURN 1 → ok; свободно 3.8 GiB |
| 2026-10-08 11:47Z | — | R-17 opened for owner | work-packages/WP-INFRA-03-neo4j-ports.md |
| 2026-10-08 11:47Z | WP-INFRA-03 | WP-INFRA-03: VERIFIED_TEST -> PROD | verify --env prod 392ed2b8ac: reports/verify-WP-INFRA-03-prod-20261008.md |
| 2026-10-08 11:46Z | WP-INFRA-03 | WP-INFRA-03: MERGED -> VERIFIED_TEST | verify --env test 392ed2b8ac: reports/verify-WP-INFRA-03-test-20261008.md |
| 2026-10-08 11:42Z | WP-INFRA-03 | WP-INFRA-03 merged in the merge queue; released transcriber:.tl/deploy-plan.md | orch.py deliver: 392ed2b8ac |
| 2026-10-08 11:42Z | WP-INFRA-03 | WP-INFRA-03: ACCEPTED -> MERGED | gh pr merge --squash: 392ed2b8ac (https://github.com/ITSalt/transcriber/pull/22) |
| 2026-10-08 11:42Z | WP-WEB-MEMORY-01 | WP-WEB-MEMORY-01 queued for merge (sequential) | — |
| 2026-10-08 11:42Z | WP-WORKER-MEMORY-01 | WP-WORKER-MEMORY-01 queued for merge (sequential) | — |
| 2026-10-08 11:42Z | WP-WEB-MEMORY-01 | WP-WEB-MEMORY-01 dropped in the merge queue | — |
| 2026-10-08 11:42Z | WP-WORKER-MEMORY-01 | WP-WORKER-MEMORY-01 dropped in the merge queue | — |
| 2026-10-08 11:42Z | WP-INFRA-03 | WP-INFRA-03 queued for merge (sequential) | — |
| 2026-10-08 11:42Z | WP-INFRA-03 | WP-INFRA-03: ACCEPTED -> ACCEPTED | reports/wp-infra-03-review-20261008.md: объём по пакету, CI run 37771497352 pass на 5d27d4a320 |
| 2026-10-08 11:42Z | WP-INFRA-03 | WP-INFRA-03: accepted at 5d27d4a320948b7a058d8d04992c24ab594edd3c | report reports/wp-infra-03-review-20261008.md |
| 2026-10-08 11:42Z | WP-INFRA-03 | WP-INFRA-03: REVIEW -> ACCEPTED | 5d27d4a320; reports/wp-infra-03-review-20261008.md |
| 2026-10-08 11:39Z | WP-INFRA-03 | WP-INFRA-03: DISPATCHING -> REVIEW | 5d27d4a320; report reports/wp-infra-03-review-20261008.md |
| 2026-10-08 11:26Z | WP-WEB-FEEDBACK-01 | WP-WEB-FEEDBACK-01 PROD: живой сценарий (аутлет, история версий, диалог отзыва) со скриншотами | reports/verify-WP-WEB-FEEDBACK-01-prod-20261008.md |
| 2026-10-08 11:24Z | WP-WEB-FEEDBACK-01 | WP-WEB-FEEDBACK-01: VERIFIED_TEST -> PROD | verify --env prod e8abab753b: reports/verify-WP-WEB-FEEDBACK-01-prod-20261008.md |
| 2026-10-08 11:24Z | WP-WEB-FEEDBACK-01 | WP-WEB-FEEDBACK-01: MERGED -> VERIFIED_TEST | verify --env test e8abab753b: reports/verify-WP-WEB-FEEDBACK-01-test-20261008.md |
| 2026-10-08 11:21Z | WP-WEB-FEEDBACK-01 | WP-WEB-FEEDBACK-01 merged in the merge queue | orch.py deliver: e8abab753b |
| 2026-10-08 11:21Z | WP-WEB-FEEDBACK-01 | WP-WEB-FEEDBACK-01: ACCEPTED -> MERGED | gh pr merge --squash: e8abab753b (https://github.com/ITSalt/transcriber/pull/18) |
| 2026-10-08 11:20Z | WP-WEB-FEEDBACK-01 | WP-WEB-FEEDBACK-01: ACCEPTED -> ACCEPTED | reports/wp-web-feedback-01-review-20261008-r3.md: rebase (+override), CI run 37769175990 pass на 79cca617f4 |
| 2026-10-08 11:20Z | WP-WEB-FEEDBACK-01 | WP-WEB-FEEDBACK-01: accepted at 79cca617f45f207f53b5f83916ee8817aac256b3 | report reports/wp-web-feedback-01-review-20261008-r3.md |
| 2026-10-08 11:19Z | WP-WEB-FEEDBACK-01 | WP-WEB-FEEDBACK-01: review round 3 started at 79cca617f4 | reports/wp-web-feedback-01-review-20261008-r3.md |
| 2026-10-08 11:15Z | WP-WEB-PROJECTS-01 | WP-WEB-PROJECTS-01 PROD: живой сценарий (навигация «Проекты», страница проектов, форма контекста при загрузке) со скриншотами | reports/verify-WP-WEB-PROJECTS-01-prod-20261008.md |
| 2026-10-08 11:14Z | WP-WEB-PROJECTS-01 | WP-WEB-PROJECTS-01: VERIFIED_TEST -> PROD | verify --env prod 7a2b25a135: reports/verify-WP-WEB-PROJECTS-01-prod-20261008.md |
| 2026-10-08 11:14Z | WP-WEB-PROJECTS-01 | WP-WEB-PROJECTS-01: MERGED -> VERIFIED_TEST | verify --env test 7a2b25a135: reports/verify-WP-WEB-PROJECTS-01-test-20261008.md |
| 2026-10-08 11:10Z | WP-WEB-PROJECTS-01 | WP-WEB-PROJECTS-01 merged in the merge queue | orch.py deliver: 7a2b25a135 |
| 2026-10-08 11:10Z | WP-WEB-PROJECTS-01 | WP-WEB-PROJECTS-01: ACCEPTED -> MERGED | gh pr merge --squash: 7a2b25a135 (https://github.com/ITSalt/transcriber/pull/19) |
| 2026-10-08 11:10Z | WP-API-PROJECTS-01 | WP-API-PROJECTS-01 PROD: живой сценарий (проекты 200/401, контекст 404, last-protocol 404, start 409) | reports/verify-WP-API-PROJECTS-01-prod-20261008.md |
| 2026-10-08 11:09Z | WP-API-PROJECTS-01 | WP-API-PROJECTS-01: VERIFIED_TEST -> PROD | verify --env prod bf75f694f2: reports/verify-WP-API-PROJECTS-01-prod-20261008.md |
| 2026-10-08 11:09Z | WP-API-PROJECTS-01 | WP-API-PROJECTS-01: MERGED -> VERIFIED_TEST | verify --env test bf75f694f2: reports/verify-WP-API-PROJECTS-01-test-20261008-2.md |
| 2026-10-08 11:09Z | — | delivery resumed: ложный FAIL: команда проверки GET /api/meetings без cookie после включения входа (R-16) отвечает 401 по контракту; деплой run 37767836347 success, health ok; команды verify_test/verify_prod в orch.yaml заменены на ожидание 401 | orch.py unhold |
| 2026-10-08 11:08Z | WP-API-PROJECTS-01 | WP-API-PROJECTS-01: rollback_test не задан | orch.py deliver |
| 2026-10-08 11:08Z | WP-API-PROJECTS-01 | delivery on hold: WP-API-PROJECTS-01: stand verification failed | https://github.com/ITSalt/transcriber/pull/20 |
| 2026-10-08 11:08Z | WP-API-PROJECTS-01 | WP-API-PROJECTS-01: verification on test failed at bf75f694f2: провалено 1 из 3: команда проверки `curl -fsS -o /dev/null -w '%{http_code}' https://transcriber.itsalt.ru/api/meetings` | reports/verify-WP-API-PROJECTS-01-test-20261008.md; bugs/BUG-1-verify-wp-api-projects-01-test.md |
| 2026-10-08 11:07Z | WP-FRONTEND-02 | WP-FRONTEND-02 PROD: экран входа и вход по PIN проверены в браузере после R-16 (скриншоты) | reports/verify-WP-FRONTEND-02-prod-20261008.md |
| 2026-10-08 11:06Z | WP-FRONTEND-02 | R-16 выполнен по ssh (D-28): вход по PIN включён на проде; CLI user:create не читает .env сам — нужен set -a; . .env (backlog: README/CLI); PIN владельцу передан вне файлов | ssh learn-prod 2026-10-08; curl login/me/logout |
| 2026-10-08 11:06Z | — | R-16 closed | выполнено оркестратором по D-28 2026-10-08: PIN_PEPPER добавлен в /opt/transcrib/.env; user:create → Роман (f5fc588d…) в пространстве «Роман»; AUTH_REQUIRED=true, pm2 restart transcrib-api (online); проверки: health 200, /api/meetings и /api/auth/me без cookie 401, login верным PIN 200 + cookie, /me 200, неверный PIN 401 INVALID_PIN, logout 204 → /me 401 |
| 2026-10-08 11:06Z | WP-API-PROJECTS-01 | WP-API-PROJECTS-01 merged in the merge queue; released transcriber:.tl/changelog.md | orch.py deliver: bf75f694f2 |
| 2026-10-08 11:06Z | WP-API-PROJECTS-01 | WP-API-PROJECTS-01: ACCEPTED -> MERGED | gh pr merge --squash: bf75f694f2 (https://github.com/ITSalt/transcriber/pull/20) |
| 2026-10-08 11:04Z | WP-WEB-PROJECTS-01 | WP-WEB-PROJECTS-01: ACCEPTED -> ACCEPTED | reports/wp-web-projects-01-review-20261008-r3.md: rebase + п.4 + start.error, CI run 37767243317 pass на 79d01c18535d |
| 2026-10-08 11:04Z | WP-WEB-PROJECTS-01 | WP-WEB-PROJECTS-01: accepted at 79d01c18535d7e6fe131b18f1b44d8cbe011c896 | report reports/wp-web-projects-01-review-20261008-r3.md |
| 2026-10-08 11:04Z | WP-WEB-PROJECTS-01 | WP-WEB-PROJECTS-01: review round 3 started at 79d01c1853 | reports/wp-web-projects-01-review-20261008-r3.md |
| 2026-10-08 11:03Z | WP-INFRA-03 | WP-INFRA-03: READY -> DISPATCHING | start command handed to the owner; model sonnet; locks transcriber:.tl/deploy-plan.md |
| 2026-10-08 11:03Z | WP-API-FEEDBACK-01 | WP-API-FEEDBACK-01 PROD: живой сценарий (версии 200, отзывы 200, POST без входа 401, карточка 200) | reports/verify-WP-API-FEEDBACK-01-prod-20261008.md |
| 2026-10-08 11:03Z | WP-API-PROJECTS-01 | WP-API-PROJECTS-01: ACCEPTED -> ACCEPTED | reports/wp-api-projects-01-review-20261008-r3.md: rebase 2, файлы пакета без изменений, CI run 37767034041 pass на 109c71f00f |
| 2026-10-08 11:03Z | WP-API-PROJECTS-01 | WP-API-PROJECTS-01: accepted at 109c71f00f310d4b777fe28adf15478b6836efa3 | report reports/wp-api-projects-01-review-20261008-r3.md |
| 2026-10-08 11:03Z | WP-API-PROJECTS-01 | WP-API-PROJECTS-01: review round 3 started at 109c71f00f | reports/wp-api-projects-01-review-20261008-r3.md |
| 2026-10-08 11:02Z | — | D-28 recorded | — |
| 2026-10-08 11:01Z | WP-INFRA-03 | WP-INFRA-03: DRAFT -> READY | пакет заполнен по D-26; XS; пути compose/README/.env.example/.tl/deploy-plan.md §9 |
| 2026-10-08 11:00Z | WP-API-FEEDBACK-01 | WP-API-FEEDBACK-01: VERIFIED_TEST -> PROD | verify --env prod 7f3b99b622: reports/verify-WP-API-FEEDBACK-01-prod-20261008.md |
| 2026-10-08 11:00Z | WP-API-FEEDBACK-01 | WP-API-FEEDBACK-01: MERGED -> VERIFIED_TEST | verify --env test 7f3b99b622: reports/verify-WP-API-FEEDBACK-01-test-20261008.md |
| 2026-10-08 10:59Z | WP-INFRA-03 | WP-INFRA-03 created (DRAFT) | work-packages/WP-INFRA-03-neo4j-ports.md |
| 2026-10-08 10:59Z | — | R-14 dropped | заменяется после доставки WP-INFRA-03 (порты 7476/7689, D-26); переменные в .env уже дописаны, URI будет исправлен новым пунктом |
| 2026-10-08 10:59Z | — | P-17 closed | answered by D-27 |
| 2026-10-08 10:59Z | — | D-27 recorded | answer to P-17 |
| 2026-10-08 10:59Z | — | P-18 closed | answered by D-26 |
| 2026-10-08 10:59Z | — | D-26 recorded | answer to P-18 |
| 2026-10-08 10:58Z | WP-WEB-FEEDBACK-01 | Очередь слияния: API-PROJECTS-01 → WEB-PROJECTS-01 → WEB-FEEDBACK-01 (доставка только после ответа P-17 и R-16) → WORKER-MEMORY-01 → WEB-MEMORY-01 (после P-18) | orch.py merge list |
| 2026-10-08 10:58Z | WP-WEB-MEMORY-01 | WP-WEB-MEMORY-01 queued for merge (sequential) | — |
| 2026-10-08 10:58Z | WP-WORKER-MEMORY-01 | WP-WORKER-MEMORY-01 queued for merge (sequential) | — |
| 2026-10-08 10:58Z | WP-WEB-FEEDBACK-01 | WP-WEB-FEEDBACK-01 queued for merge (sequential) | — |
| 2026-10-08 10:58Z | WP-WEB-MEMORY-01 | WP-WEB-MEMORY-01 dropped in the merge queue | — |
| 2026-10-08 10:58Z | WP-WORKER-MEMORY-01 | WP-WORKER-MEMORY-01 dropped in the merge queue | — |
| 2026-10-08 10:58Z | WP-WEB-FEEDBACK-01 | WP-WEB-FEEDBACK-01 dropped in the merge queue | — |
| 2026-10-08 10:57Z | WP-WEB-MEMORY-01 | WP-WEB-MEMORY-01 queued for merge (sequential) | — |
| 2026-10-08 10:57Z | WP-WORKER-MEMORY-01 | WP-WORKER-MEMORY-01 queued for merge (sequential) | — |
| 2026-10-08 10:57Z | WP-WEB-PROJECTS-01 | WP-WEB-PROJECTS-01 queued for merge (sequential) | — |
| 2026-10-08 10:57Z | WP-WEB-FEEDBACK-01 | WP-WEB-FEEDBACK-01 queued for merge (sequential) | — |
| 2026-10-08 10:57Z | WP-WEB-MEMORY-01 | WP-WEB-MEMORY-01 dropped in the merge queue | — |
| 2026-10-08 10:57Z | WP-WORKER-MEMORY-01 | WP-WORKER-MEMORY-01 dropped in the merge queue | — |
| 2026-10-08 10:57Z | WP-API-PROJECTS-01 | WP-API-PROJECTS-01 queued for merge (sequential) | — |
| 2026-10-08 10:57Z | WP-API-PROJECTS-01 | WP-API-PROJECTS-01: ACCEPTED -> ACCEPTED | reports/wp-api-projects-01-review-20261008-r2.md: пункт 1 закрыт; CI run 37766507835 pass на 17bdd3261e; ждём merge main (rebase 2) перед доставкой |
| 2026-10-08 10:57Z | WP-API-PROJECTS-01 | WP-API-PROJECTS-01: accepted at 17bdd3261e19e2952d321727c91ea012f3d3e783 | report reports/wp-api-projects-01-review-20261008-r2.md |
| 2026-10-08 10:57Z | WP-API-PROJECTS-01 | WP-API-PROJECTS-01: REVIEW -> ACCEPTED | 17bdd3261e; reports/wp-api-projects-01-review-20261008-r2.md |
| 2026-10-08 10:56Z | WP-API-PROJECTS-01 | WP-API-PROJECTS-01: REVISE -> REVIEW | 17bdd3261e; report reports/wp-api-projects-01-review-20261008-r2.md |
| 2026-10-08 10:56Z | WP-API-FEEDBACK-01 | WP-API-FEEDBACK-01 merged in the merge queue; released transcriber:.tl/status.json | orch.py deliver: 7f3b99b622 |
| 2026-10-08 10:56Z | WP-API-FEEDBACK-01 | WP-API-FEEDBACK-01: ACCEPTED -> MERGED | gh pr merge --squash: 7f3b99b622 (https://github.com/ITSalt/transcriber/pull/21) |
| 2026-10-08 10:55Z | WP-API-PROJECTS-01 | lock transcriber:graph released | orch.py lock |
| 2026-10-08 10:53Z | WP-API-FEEDBACK-01 | WP-API-FEEDBACK-01: ACCEPTED -> ACCEPTED | reports/wp-api-feedback-01-review-20261008-r2.md: docs+rebase, код без изменений, CI run 37766184266 pass на e420bd0f93 |
| 2026-10-08 10:53Z | WP-API-FEEDBACK-01 | WP-API-FEEDBACK-01: accepted at e420bd0f93b4c6dda41967f3f9b7f1bb26b64aa6 | report reports/wp-api-feedback-01-review-20261008-r2.md |
| 2026-10-08 10:51Z | WP-API-FEEDBACK-01 | WP-API-FEEDBACK-01: review round 2 started at e420bd0f93 | reports/wp-api-feedback-01-review-20261008-r2.md |
| 2026-10-08 10:51Z | — | PLUGIN-BUG-4: столкновение одноразовых клонов двух параллельных сверок (review_clone.sh); Issue https://github.com/ITSalt/PepperSkills/issues/35 (D-18); orch.yaml review_setup += shared build | bugs/PLUGIN-BUG-4.md |
| 2026-10-08 10:50Z | WP-API-PROJECTS-01 | lock transcriber:graph acquired | orch.py lock |
| 2026-10-08 10:50Z | WP-API-PROJECTS-01 | WP-API-PROJECTS-01: REVIEW -> REVISE | reports/wp-api-projects-01-review-20261008.md: 1 пункт (500 при протоколе проекта > 50 000 → 422 PREVIOUS_PROTOCOL_TOO_LONG, A-9) + .tl-правки + merge main |
| 2026-10-08 10:50Z | WP-API-PROJECTS-01 | WP-API-PROJECTS-01 waits for lock transcriber:shared/src/api/errors.ts (WP-WORKER-MEMORY-01) | orch.py lock acquire |
| 2026-10-08 10:50Z | — | A-9 recorded | — |
| 2026-10-08 10:48Z | WP-WEB-MEMORY-01 | WP-WEB-MEMORY-01 queued for merge (sequential) | — |
| 2026-10-08 10:48Z | WP-WORKER-MEMORY-01 | WP-WORKER-MEMORY-01 queued for merge (sequential) | — |
| 2026-10-08 10:48Z | WP-API-FEEDBACK-01 | WP-API-FEEDBACK-01 queued for merge (sequential) | — |
| 2026-10-08 10:48Z | WP-WEB-MEMORY-01 | WP-WEB-MEMORY-01 dropped in the merge queue | — |
| 2026-10-08 10:48Z | WP-WORKER-MEMORY-01 | WP-WORKER-MEMORY-01 dropped in the merge queue | — |
| 2026-10-08 10:48Z | WP-API-FEEDBACK-01 | WP-API-FEEDBACK-01: ACCEPTED -> ACCEPTED | reports/wp-api-feedback-01-review-20261008.md: ACCEPTED (low/info в backlog), CI run 37763860894 pass; условия: .tl-правки + merge main → новый SHA; P-17 до WEB-FEEDBACK-01 |
| 2026-10-08 10:48Z | WP-API-FEEDBACK-01 | WP-API-FEEDBACK-01: accepted at a7798d4fc4531d0a7dd6709a486626a66d1af29e | report reports/wp-api-feedback-01-review-20261008.md |
| 2026-10-08 10:48Z | WP-API-FEEDBACK-01 | WP-API-FEEDBACK-01: REVIEW -> ACCEPTED | a7798d4fc4; reports/wp-api-feedback-01-review-20261008.md |
| 2026-10-08 10:40Z | WP-WORKER-MEMORY-01 | R-15 закрыт по ssh с cloudpc (владелец открыл доступ, только чтение по правилу 1): 7475/7688 заняты fc-neo4j; открыт P-18 (порты) | ssh deploy@transcriber.itsalt.ru ss -ltnp / docker ps |
| 2026-10-08 10:40Z | — | P-18 opened for owner | work-packages/WP-WORKER-MEMORY-01-pipeline.md |
| 2026-10-08 10:40Z | — | R-15 closed | 2026-10-08 ssh learn-prod: 127.0.0.1:7475 и :7688 слушает docker-proxy контейнера fc-neo4j (7475->7474, 7688->7687); MEMORY_NEO4J_ в /opt/transcrib/.env = 4 строки (дописаны один раз); свободно 4.6 GiB |
| 2026-10-08 10:39Z | WP-API-FEEDBACK-01 | WP-API-FEEDBACK-01 UNLOCK graph: UC-303/304/305 детализированы (v2, шаги), RQ-052/053 дополнены, NEW RQ-065, DEC-012; .tl правки — после вердикта; P-17 про 401 для легаси-принципала | сообщение сессии 2026-10-08; read-cypher |
| 2026-10-08 10:39Z | — | P-17 opened for owner | reports/wp-api-feedback-01-review-20261008.md |
| 2026-10-08 10:39Z | WP-API-FEEDBACK-01 | lock transcriber:.tl/status.json acquired | orch.py lock |
| 2026-10-08 10:39Z | WP-API-FEEDBACK-01 | WP-API-FEEDBACK-01 waits for lock transcriber:.tl/changelog.md (WP-API-PROJECTS-01) | orch.py lock acquire |
| 2026-10-08 10:39Z | WP-API-FEEDBACK-01 | lock transcriber:graph released | orch.py lock |
| 2026-10-08 10:37Z | WP-WORKER-01 | WP-WORKER-01 PROD: живой сценарий записан (pm2 online, снапшот промпта в CI, флаг keyterms выключен) | reports/verify-WP-WORKER-01-prod-20261008.md |
| 2026-10-08 10:37Z | WP-WORKER-01 | WP-WORKER-01: VERIFIED_TEST -> PROD | verify --env prod 40d6ba5bc2: reports/verify-WP-WORKER-01-prod-20261008.md |
| 2026-10-08 10:37Z | WP-API-FEEDBACK-01 | lock transcriber:graph acquired | orch.py lock |
| 2026-10-08 10:36Z | WP-WORKER-01 | WP-WORKER-01: MERGED -> VERIFIED_TEST | verify --env test 40d6ba5bc2: reports/verify-WP-WORKER-01-test-20261008.md |
| 2026-10-08 10:33Z | WP-WORKER-01 | WP-WORKER-01 merged in the merge queue | orch.py deliver: 40d6ba5bc2 |
| 2026-10-08 10:33Z | WP-WORKER-01 | WP-WORKER-01: ACCEPTED -> MERGED | gh pr merge --squash: 40d6ba5bc2 (https://github.com/ITSalt/transcriber/pull/17) |
| 2026-10-08 10:33Z | WP-API-PROJECTS-01 | WP-API-PROJECTS-01 UNLOCK graph: RQ-047/MeetingContext-A08 изменены (лимит 50000, D-25), NEW RQ-064, DEC-011, UC-502/503 spec_version 2; правка .tl md — в раунде REVISE под замками путей | сообщение сессии 2026-10-08; read-cypher ниже |
| 2026-10-08 10:33Z | WP-API-PROJECTS-01 | lock transcriber:.tl/changelog.md acquired | orch.py lock |
| 2026-10-08 10:33Z | WP-API-PROJECTS-01 | lock transcriber:graph released | orch.py lock |
| 2026-10-08 10:32Z | WP-WORKER-01 | WP-WORKER-01 готов к доставке (G1–G10 кроме G5: замок graph у WP-API-PROJECTS-01 на /nacl-sa-feature); доставка после UNLOCK | orch.py deliver --check WP-WORKER-01 |
| 2026-10-08 10:32Z | WP-API-FEEDBACK-01 | WP-API-FEEDBACK-01 waits for lock transcriber:graph (WP-API-PROJECTS-01) | orch.py lock acquire |
| 2026-10-08 10:31Z | WP-WORKER-01 | WP-WORKER-01: accepted at d0728e2380daf34e218ceb00748294616d13ad3d | report reports/wp-worker-01-review-20261008-r3.md |
| 2026-10-08 10:31Z | WP-API-PROJECTS-01 | lock transcriber:graph acquired | orch.py lock |
| 2026-10-08 10:30Z | WP-API-FEEDBACK-01 | WP-API-FEEDBACK-01: DISPATCHING -> REVIEW | a7798d4fc4; report reports/wp-api-feedback-01-review-20261008.md |
| 2026-10-08 10:30Z | WP-API-PROJECTS-01 | WP-API-PROJECTS-01: DISPATCHING -> REVIEW | 1c05fcbbdc; report reports/wp-api-projects-01-review-20261008.md |
| 2026-10-08 10:28Z | WP-WORKER-01 | WP-WORKER-01: review round 3 started at d0728e2380 | reports/wp-worker-01-review-20261008-r3.md |
| 2026-10-08 10:27Z | WP-FRONTEND-02 | WP-FRONTEND-02 PROD: живой сценарий (шапка, список задач, /login→список, 404) записан; R-16 — включение входа | reports/verify-WP-FRONTEND-02-prod-20261008.md |
| 2026-10-08 10:27Z | — | R-16 opened for owner | work-packages/WP-FRONTEND-02-login-tasks.md |
| 2026-10-08 10:27Z | WP-FRONTEND-02 | WP-FRONTEND-02: VERIFIED_TEST -> PROD | verify --env prod ae76dda3e3: reports/verify-WP-FRONTEND-02-prod-20261008.md |
| 2026-10-08 10:25Z | WP-FRONTEND-02 | WP-FRONTEND-02: MERGED -> VERIFIED_TEST | verify --env test ae76dda3e3: reports/verify-WP-FRONTEND-02-test-20261008.md |
| 2026-10-08 10:22Z | WP-FRONTEND-02 | WP-FRONTEND-02 merged in the merge queue; released transcriber:web/src/i18n/** | orch.py deliver: ae76dda3e3 |
| 2026-10-08 10:22Z | WP-FRONTEND-02 | WP-FRONTEND-02: ACCEPTED -> MERGED | gh pr merge --squash: ae76dda3e3 (https://github.com/ITSalt/transcriber/pull/13) |
| 2026-10-08 10:22Z | WP-FRONTEND-02 | WP-FRONTEND-02: accepted at 4b4d74a97053accbbd0d2d4a11b452fc16c0f91b | report reports/wp-frontend-02-review-20261008-r2.md |
| 2026-10-08 10:21Z | WP-FRONTEND-02 | WP-FRONTEND-02: ACCEPTED -> ACCEPTED | reports/wp-frontend-02-review-20261008-r2.md: rebase на main, diff по web/ пуст, CI run 37762486203 pass на 4b4d74a970; graph: checked |
| 2026-10-08 10:21Z | WP-FRONTEND-02 | WP-FRONTEND-02 раунд 2 (rebase) ACCEPTED на 4b4d74a970; graph: checked | reports/wp-frontend-02-review-20261008-r2.md |
| 2026-10-08 10:21Z | WP-API-PROJECTS-01 | WP-API-PROJECTS-01 waits for lock transcriber:shared/src/api/program-contract.test.ts (WP-WORKER-MEMORY-01) | orch.py lock acquire |
| 2026-10-08 10:21Z | WP-API-PROJECTS-01 | WP-API-PROJECTS-01 waits for lock transcriber:shared/src/api/context.ts (WP-WORKER-MEMORY-01) | orch.py lock acquire |
| 2026-10-08 10:21Z | — | A-8 recorded | — |
| 2026-10-08 10:20Z | WP-FRONTEND-02 | WP-FRONTEND-02: review round 2 started at 4b4d74a970 | reports/wp-frontend-02-review-20261008-r2.md |
| 2026-10-08 10:17Z | WP-FRONTEND-02 | WP-FRONTEND-02 rebase на main (fd9ca65): 4b4d74a970 = merge-коммит feb98ef+main, diff feb98ef..4b4d74a -- web/ пустой, вне web/ только main; принятая ревизия обновлена, ждём CI | git diff --stat feb98efd46 4b4d74a970 -- web/ (пусто); git log 4b4d74a970 parents feb98ef fd9ca65 |
| 2026-10-08 10:15Z | WP-API-FEEDBACK-01 | WP-API-FEEDBACK-01: READY -> DISPATCHING | start command handed to the owner; model sonnet |
| 2026-10-08 10:15Z | WP-API-PROJECTS-01 | WP-API-PROJECTS-01: READY -> DISPATCHING | start command handed to the owner; model sonnet |
| 2026-10-08 10:15Z | WP-BACKEND-01 | WP-BACKEND-01 PROD: живой сценарий записан; R-14 упал на порту 7475 (переменные уже в .env), открыт R-15 | reports/verify-WP-BACKEND-01-prod-20261008.md |
| 2026-10-08 10:15Z | WP-BACKEND-01 | lock transcriber:migrations released | orch.py lock |
| 2026-10-08 10:14Z | — | R-15 opened for owner | work-packages/WP-WORKER-MEMORY-01-pipeline.md |
| 2026-10-08 10:14Z | WP-BACKEND-01 | WP-BACKEND-01: VERIFIED_TEST -> PROD | verify --env prod fd9ca659f0: reports/verify-WP-BACKEND-01-prod-20261008.md |
| 2026-10-08 10:13Z | WP-API-PROJECTS-01 | D-23/D-24/D-25 записаны (P-14 a, P-15 a, P-16 b); WP-API-PROJECTS-01 п.2/п.9: лимит предыдущего протокола 50 000 в shared/ | decisions.md D-23..D-25 |
| 2026-10-08 10:12Z | WP-BACKEND-01 | WP-BACKEND-01: MERGED -> VERIFIED_TEST | verify --env test fd9ca659f0: reports/verify-WP-BACKEND-01-test-20261008.md |
| 2026-10-08 10:12Z | — | P-16 closed | answered by D-25 |
| 2026-10-08 10:12Z | — | D-25 recorded | answer to P-16 |
| 2026-10-08 10:12Z | — | P-15 closed | answered by D-24 |
| 2026-10-08 10:12Z | — | D-24 recorded | answer to P-15 |
| 2026-10-08 10:12Z | — | P-14 closed | answered by D-23 |
| 2026-10-08 10:12Z | — | D-23 recorded | answer to P-14 |
| 2026-10-08 10:09Z | WP-BACKEND-01 | WP-BACKEND-01 merged in the merge queue; released transcriber:api/prisma/**, transcriber:.tl/**, transcriber:api/package.json | orch.py deliver: fd9ca659f0 |
| 2026-10-08 10:09Z | WP-BACKEND-01 | WP-BACKEND-01: ACCEPTED -> MERGED | gh pr merge --squash: fd9ca659f0 (https://github.com/ITSalt/transcriber/pull/15) |
| 2026-10-08 10:09Z | — | R-12 closed | 2026-10-08 13:08 VM: ~/backup/transcrib-before-backend01-20261008-1308.dump 1019118 байт; / 9.9G свободно |
| 2026-10-07 22:46Z | WP-WEB-PROJECTS-01 | WP-WEB-PROJECTS-01: REVIEW -> ACCEPTED | reports/wp-web-projects-01-review-20261007-r2.md: пп.1–3 закрыты; CI run 37697951039 pass на 1147a5b; клон web test/typecheck exit 0; п.4 + start.error — в раунде rebase; merge после API-PROJECTS-01 и WORKER-01 |
| 2026-10-07 22:43Z | WP-WEB-PROJECTS-01 | WP-WEB-PROJECTS-01: REVISE -> REVIEW | 1147a5b9d5; report reports/wp-web-projects-01-review-20261007-r2.md |
| 2026-10-07 22:41Z | WP-WEB-FEEDBACK-01 | WP-WEB-FEEDBACK-01: REVIEW -> ACCEPTED | reports/wp-web-feedback-01-review-20261007-r2.md: 5/5 пунктов закрыты; CI run 37697596048 pass на 1b52d6a; merge после WP-API-FEEDBACK-01 |
| 2026-10-07 22:40Z | WP-WEB-FEEDBACK-01 | WP-WEB-FEEDBACK-01: REVISE -> REVIEW | 1b52d6aee9; report reports/wp-web-feedback-01-review-20261007-r2.md |
| 2026-10-07 22:38Z | WP-WEB-FEEDBACK-01 | WP-WEB-FEEDBACK-01: REVIEW -> REVISE | reports/wp-web-feedback-01-review-20261007.md: 4 пункта (тест аутлета; тест инвалидации истории; text между вкладками; пустой MIME) + 1 по желанию |
| 2026-10-07 22:38Z | — | A-7 recorded | — |
| 2026-10-07 22:34Z | WP-WEB-PROJECTS-01 | WP-WEB-PROJECTS-01: REVIEW -> REVISE | reports/wp-web-projects-01-review-20261007.md: 3 пункта сейчас (AWAITING_START без выхода; статус complete; 409 → навигация) + 1 при rebase на FRONTEND-02 |
| 2026-10-07 22:33Z | — | Очередь слияний перестроена по порядку доставки: BACKEND-01 → FRONTEND-02 → WORKER-01 → WORKER-MEMORY-01 (после R-14) → WEB-MEMORY-01 (после волны 3) | orch.py merge drop/add |
| 2026-10-07 22:33Z | WP-WEB-MEMORY-01 | WP-WEB-MEMORY-01 queued for merge (sequential) | https://github.com/ITSalt/transcriber/pull/14 |
| 2026-10-07 22:33Z | WP-WORKER-MEMORY-01 | WP-WORKER-MEMORY-01 queued for merge (sequential) | https://github.com/ITSalt/transcriber/pull/16 |
| 2026-10-07 22:33Z | WP-WORKER-01 | WP-WORKER-01 queued for merge (sequential) | https://github.com/ITSalt/transcriber/pull/17 |
| 2026-10-07 22:33Z | WP-FRONTEND-02 | WP-FRONTEND-02 queued for merge (sequential) | https://github.com/ITSalt/transcriber/pull/13 |
| 2026-10-07 22:33Z | WP-BACKEND-01 | WP-BACKEND-01 queued for merge (sequential) | https://github.com/ITSalt/transcriber/pull/15 |
| 2026-10-07 22:33Z | WP-WORKER-MEMORY-01 | WP-WORKER-MEMORY-01 dropped in the merge queue | — |
| 2026-10-07 22:33Z | WP-WORKER-01 | WP-WORKER-01 dropped in the merge queue | — |
| 2026-10-07 22:33Z | WP-WEB-MEMORY-01 | WP-WEB-MEMORY-01 dropped in the merge queue | — |
| 2026-10-07 22:33Z | WP-FRONTEND-02 | WP-FRONTEND-02 dropped in the merge queue | — |
| 2026-10-07 22:33Z | WP-BACKEND-01 | WP-BACKEND-01: accepted at ba7553656848d0e71a937fcebf1ffb59139b3b50 | report reports/wp-backend-01-review-20261007-r2.md |
| 2026-10-07 22:33Z | WP-BACKEND-01 | WP-BACKEND-01: REVIEW -> ACCEPTED | ba75536568; reports/wp-backend-01-review-20261007-r2.md |
| 2026-10-07 22:32Z | WP-BACKEND-01 | WP-BACKEND-01: REVISE -> REVIEW | ba75536568; report reports/wp-backend-01-review-20261007-r2.md |
| 2026-10-07 22:25Z | WP-WEB-FEEDBACK-01 | WP-WEB-FEEDBACK-01: IN_PROGRESS -> REVIEW | 966f21b6e9; report reports/wp-web-feedback-01-review-20261007.md |
| 2026-10-07 22:24Z | WP-WEB-PROJECTS-01 | WP-WEB-PROJECTS-01: IN_PROGRESS -> REVIEW | d2d18ffef1; report reports/wp-web-projects-01-review-20261007.md |
| 2026-10-07 22:24Z | WP-BACKEND-01 | WP-BACKEND-01: REVIEW -> REVISE | reports/wp-backend-01-review-20261007.md: 2 пункта — оставить DEFAULT (D-22, окно деплоя), тест legacy-загрузки без workspace_id; остальное принято, 9/9 мутаций |
| 2026-10-07 22:24Z | — | D-22 recorded | — |
| 2026-10-07 22:22Z | — | R-14 opened for owner | work-packages/WP-WORKER-MEMORY-01-pipeline.md |
| 2026-10-07 22:22Z | — | R-13 dropped | текст пункта споткнул линт о секреты (строка вида PASSWORD=…); заменён на R-14 с той же сутью |
| 2026-10-07 22:22Z | — | R-13 opened for owner | work-packages/WP-WORKER-MEMORY-01-pipeline.md |
| 2026-10-07 22:22Z | WP-WORKER-MEMORY-01 | WP-WORKER-MEMORY-01 queued for merge (sequential) | https://github.com/ITSalt/transcriber/pull/16 |
| 2026-10-07 22:22Z | WP-WORKER-MEMORY-01 | WP-WORKER-MEMORY-01: accepted at b6561a5cf7ffe8ec9a98d4576e87b8a98aa060d1 | report reports/wp-worker-memory-01-review-20261007-r2.md |
| 2026-10-07 22:22Z | WP-WORKER-MEMORY-01 | WP-WORKER-MEMORY-01: REVIEW -> ACCEPTED | b6561a5cf7; reports/wp-worker-memory-01-review-20261007-r2.md |
| 2026-10-07 22:19Z | WP-WORKER-MEMORY-01 | WP-WORKER-MEMORY-01: REVISE -> REVIEW | b6561a5cf7; report reports/wp-worker-memory-01-review-20261007-r2.md |
| 2026-10-07 22:19Z | WP-WORKER-01 | WP-WORKER-01 queued for merge (sequential) | https://github.com/ITSalt/transcriber/pull/17 |
| 2026-10-07 22:19Z | WP-WORKER-01 | WP-WORKER-01: accepted at 830af93698b27ef103f40983dd437fd14b2b0444 | report reports/wp-worker-01-review-20261007-r2.md |
| 2026-10-07 22:19Z | WP-WORKER-01 | WP-WORKER-01: REVIEW -> ACCEPTED | 830af93698; reports/wp-worker-01-review-20261007-r2.md |
| 2026-10-07 22:19Z | WP-WORKER-01 | WP-WORKER-01: REVISE -> REVIEW | 830af93698; report reports/wp-worker-01-review-20261007-r2.md |
| 2026-10-07 22:17Z | WP-BACKEND-01 | WP-BACKEND-01: UNLOCK graph — отложенная запись выполнена (UC-400-BE done, wave-15 done, FR-003 dev-complete) | сообщение product-backend |
| 2026-10-07 22:17Z | WP-BACKEND-01 | lock transcriber:graph released | orch.py lock |
| 2026-10-07 22:17Z | WP-BACKEND-01 | lock transcriber:graph acquired | отложенная запись UC-400-BE done / wave-15 / FR-003 dev-complete |
| 2026-10-07 22:17Z | — | Граф спецификаций (dev Neo4j 3627) упал по OOM в 20:43Z (контейнер codex-transcriber-knowledge-neo4j из ~/projects/.graphs/transcriber, без лимита памяти); первая попытка подняла не тот контейнер (graph-infra compose, пустой том, 0 узлов) — снят; настоящий перезапущен через compose down/up: 855 узлов, ADR-013/UC-400/UC-600/RQ-063/DEC-010 на месте. BACKEND-01 допишет отложенную запись | docker inspect/ps; cypher-shell count 2026-10-07 ~23:00Z |
| 2026-10-07 22:15Z | WP-WORKER-MEMORY-01 | WP-WORKER-MEMORY-01: REVIEW -> REVISE | reports/wp-worker-memory-01-review-20261007.md: 3 пункта (гейт D-14: нечёткая цитата score 1 → AUTO; логи с текстом встречи; DEPENDS_ON/SUBTASK_OF не реализованы — объявить) |
| 2026-10-07 22:15Z | WP-WEB-MEMORY-01 | WP-WEB-MEMORY-01 queued for merge (sequential) | https://github.com/ITSalt/transcriber/pull/14 |
| 2026-10-07 22:15Z | WP-WEB-MEMORY-01 | WP-WEB-MEMORY-01: accepted at b404424afc15dc8453157504f31678b1f271e41a | report reports/wp-web-memory-01-review-20261007-r2.md |
| 2026-10-07 22:15Z | WP-WEB-MEMORY-01 | WP-WEB-MEMORY-01: REVIEW -> ACCEPTED | b404424afc; reports/wp-web-memory-01-review-20261007-r2.md |
| 2026-10-07 22:13Z | WP-WEB-MEMORY-01 | WP-WEB-MEMORY-01: REVISE -> REVIEW | b404424afc; report reports/wp-web-memory-01-review-20261007-r2.md |
| 2026-10-07 22:13Z | — | P-16 opened for owner | reports/wp-worker-01-review-20261007.md |
| 2026-10-07 22:13Z | — | P-15 opened for owner | reports/wp-worker-01-review-20261007.md |
| 2026-10-07 22:13Z | WP-WORKER-01 | WP-WORKER-01: REVIEW -> REVISE | reports/wp-worker-01-review-20261007.md: 1 обязательный low-пункт (моки S3 в трёх тестовых файлах) + 1 по желанию (таймаут провайдера памяти); условие merge подтверждено |
| 2026-10-07 22:13Z | WP-FRONTEND-02 | WP-FRONTEND-02 queued for merge (sequential) | https://github.com/ITSalt/transcriber/pull/13 |
| 2026-10-07 22:13Z | WP-FRONTEND-02 | WP-FRONTEND-02: accepted at feb98efd465f032e13871caae1b9dbaf393a0725 | report reports/wp-frontend-02-review-20261007.md |
| 2026-10-07 22:13Z | WP-FRONTEND-02 | WP-FRONTEND-02: REVIEW -> ACCEPTED | feb98efd46; reports/wp-frontend-02-review-20261007.md |
| 2026-10-07 22:07Z | WP-WEB-MEMORY-01 | WP-WEB-MEMORY-01: REVIEW -> REVISE | reports/wp-web-memory-01-review-20261007.md: 2 low-пункта (инвалидация очереди после 409; «Сохранено» после перезапроса); аутлет protocol.toolbar вписан в WEB-FEEDBACK-01 п. 8 |
| 2026-10-07 22:04Z | — | R-12 opened for owner | work-packages/WP-BACKEND-01-auth-workspaces.md |
| 2026-10-07 22:04Z | WP-BACKEND-01 | WP-BACKEND-01: IN_PROGRESS -> REVIEW | 0f9f56171b; report reports/wp-backend-01-review-20261007.md |
| 2026-10-07 22:04Z | WP-BACKEND-01 | lock transcriber:graph released | orch.py lock |
| 2026-10-07 22:01Z | WP-BACKEND-01 | lock transcriber:graph acquired | LOCK message: Task UC-400-BE → done, FR-003 dev-complete |
| 2026-10-07 21:56Z | WP-WORKER-01 | WP-WORKER-01: IN_PROGRESS -> REVIEW | 4c1a580e4b; report reports/wp-worker-01-review-20261007.md |
| 2026-10-07 21:54Z | WP-WORKER-MEMORY-01 | WP-WORKER-MEMORY-01: IN_PROGRESS -> REVIEW | 58dcf8efbd; report reports/wp-worker-memory-01-review-20261007.md |
| 2026-10-07 21:54Z | WP-WORKER-MEMORY-01 | lock transcriber:dev-stack released | orch.py lock |
| 2026-10-07 21:54Z | WP-WEB-MEMORY-01 | WP-WEB-MEMORY-01: review round 1 started at dd0ee730e5 | reports/wp-web-memory-01-review-20261007.md |
| 2026-10-07 21:54Z | WP-FRONTEND-02 | WP-FRONTEND-02: REVIEW -> REVIEW | review-start feb98ef, PR #13; ревьюер запущен |
| 2026-10-07 21:54Z | WP-FRONTEND-02 | lock transcriber:web/src/i18n/** acquired | ретроактивно: пакет изменил root en/ru.json без объявления; замок был свободен |
| 2026-10-07 21:52Z | WP-WEB-MEMORY-01 | WP-WEB-MEMORY-01: READY dd0ee73, PR #14 (окно связи); ревью после восстановления доступа к GitHub, порядок: FRONTEND-02 первым | сообщение product-web-memory |
| 2026-10-07 21:52Z | WP-WEB-MEMORY-01 | WP-WEB-MEMORY-01: IN_PROGRESS -> REVIEW | READY dd0ee73, PR #14 |
| 2026-10-07 21:52Z | WP-FRONTEND-02 | WP-FRONTEND-02: IN_PROGRESS -> REVIEW | feb98efd46; report reports/wp-frontend-02-review-20261007.md |
| 2026-10-07 21:37Z | WP-BACKEND-01 | WP-BACKEND-01: QUESTION о сбросе счётчика блокировки — ANSWER: буквально по D-8 (A-6), нюанс окна времени — P-14 владельцу, не блокирует; находка вне пакета: SSRF в экспорте PDF — записана как BUG-1 (отдельный пакет после волны 2) | сообщение product-backend; bugs/BUG-1.md |
| 2026-10-07 21:37Z | — | P-14 opened for owner | work-packages/WP-BACKEND-01-auth-workspaces.md |
| 2026-10-07 21:37Z | — | A-6 recorded | — |
| 2026-10-07 21:26Z | WP-WORKER-MEMORY-01 | WP-WORKER-MEMORY-01: код готов локально (58dcf8e; shared 141, worker 299 зелёные на memory-neo4j); push/PR ждут сети | сообщение product-worker-memory |
| 2026-10-07 21:02Z | WP-WEB-PROJECTS-01 | WP-WEB-PROJECTS-01: сессия стартовала и закончила код локально (d2d18ff; web 179/179); E2E отложен до merge API-PROJECTS-01/WORKER-01; push ждёт сети | сообщение product-web-projects |
| 2026-10-07 21:02Z | WP-WEB-PROJECTS-01 | WP-WEB-PROJECTS-01: DISPATCHING -> IN_PROGRESS | сообщение product-web-projects: код готов локально (d2d18ff), push ждёт сети; QUESTION D-17 отвечен |
| 2026-10-07 20:51Z | WP-WEB-MEMORY-01 | WP-WEB-MEMORY-01: сессия стартовала и закончила код локально (dd0ee73); E2E/скриншоты отложены до merge API-MEMORY-01 и WEB-PROJECTS-01; push ждёт сети | сообщение product-web-memory |
| 2026-10-07 20:51Z | WP-WEB-MEMORY-01 | WP-WEB-MEMORY-01: DISPATCHING -> IN_PROGRESS | сообщение product-web-memory: код готов локально (dd0ee73), push ждёт сети; QUESTION D-17 отвечен |
| 2026-10-07 20:48Z | WP-WEB-FEEDBACK-01 | WP-WEB-FEEDBACK-01: сессия стартовала и закончила код локально (966f21b); push/PR ждут сети; ANSWER D-17 (b) | сообщение product-web-feedback |
| 2026-10-07 20:48Z | WP-WEB-FEEDBACK-01 | WP-WEB-FEEDBACK-01: DISPATCHING -> IN_PROGRESS | сообщение product-web-feedback: код готов локально (966f21b), push ждёт сети; QUESTION D-17 отвечен |
| 2026-10-07 20:43Z | WP-WORKER-MEMORY-01 | WP-WORKER-MEMORY-01: UNLOCK graph (UC-600 11 шагов, UC-605 4 шага, RQ-063) | сообщение product-worker-memory |
| 2026-10-07 20:43Z | WP-WORKER-MEMORY-01 | lock transcriber:graph released | orch.py lock |
| 2026-10-07 20:41Z | WP-WORKER-01 | WP-WORKER-01: UNLOCK graph (UC-200/UC-300 уточнены, RQ-059..062, DEC-010); Q-2 закрыт фактом (D-21); замок graph передан WP-WORKER-MEMORY-01 из очереди | сообщение product-worker; orch.py lock release/acquire |
| 2026-10-07 20:41Z | — | D-21 recorded | — |
| 2026-10-07 20:41Z | WP-WORKER-MEMORY-01 | lock transcriber:graph acquired | из очереди: UC-600/UC-605 детализация |
| 2026-10-07 20:41Z | WP-WORKER-01 | lock transcriber:graph released | orch.py lock |
| 2026-10-07 20:37Z | WP-WORKER-MEMORY-01 | lock transcriber:dev-stack acquired | LOCK message: memory-neo4j на 127.0.0.1:7688 для интеграционных тестов |
| 2026-10-07 20:36Z | WP-WORKER-MEMORY-01 | WP-WORKER-MEMORY-01: сессия стартовала; LOCK graph — HOLD, замок у WP-WORKER-01, пакет в очереди | orch.py lock acquire graph |
| 2026-10-07 20:36Z | WP-WORKER-MEMORY-01 | WP-WORKER-MEMORY-01: DISPATCHING -> IN_PROGRESS | сообщение product-worker-memory: сессия запущена, LOCK graph (в очереди за WP-WORKER-01) |
| 2026-10-07 20:36Z | WP-WORKER-MEMORY-01 | WP-WORKER-MEMORY-01 waits for lock transcriber:graph (WP-WORKER-01) | orch.py lock acquire |
| 2026-10-07 20:32Z | WP-WORKER-01 | WP-WORKER-01: LOCK graph выдан; QUESTION по п. 8 — ANSWER (b): миграций не добавлять, слот слияния после WP-BACKEND-01 (сверка FR-005 в его миграции), при rebase перед merge проверить её наличие в main | сообщение product-worker; migrations держит WP-BACKEND-01 |
| 2026-10-07 20:32Z | WP-WORKER-01 | lock transcriber:graph acquired | LOCK message: /nacl-sa-feature UC-200 keyterm, UC-300 context/memory/generation |
| 2026-10-07 20:32Z | WP-WORKER-01 | WP-WORKER-01: сессия product-worker стартовала; QUESTION instructions — ANSWER D-17 (b) | сообщение product-worker |
| 2026-10-07 20:32Z | WP-WORKER-01 | WP-WORKER-01: DISPATCHING -> IN_PROGRESS | сообщение product-worker: сессия запущена, ветка от 2570d0a; QUESTION по D-17 отвечен |
| 2026-10-07 20:31Z | — | Второй сетевой сбой машины оркестратора с ~20:10Z: GitHub 443/22 недоступны для всех сессий; product-frontend не может запушить готовый FRONTEND-02 (feb98ef); ждём, повтор push на стороне сессий | диагностика 20:31Z; сообщение product-frontend |
| 2026-10-07 20:31Z | WP-FRONTEND-02 | WP-FRONTEND-02: DISPATCHING -> IN_PROGRESS | сообщение product-frontend: работа готова локально, коммит feb98efd в feature/wp-frontend-02-login-tasks; push/PR ждут восстановления сети |
| 2026-10-07 20:28Z | WP-BACKEND-01 | WP-BACKEND-01: QUESTION — scripts в api/package.json для CLI user:*; ANSWER: замок api/package.json выдан, объявление в шапке дополнено, зависимости/lockfile не трогать | orch.py lock acquire api/package.json |
| 2026-10-07 20:28Z | WP-BACKEND-01 | lock transcriber:api/package.json acquired | 5 строк scripts (user:create\|grant\|reset-pin\|blocks\|unblock), без зависимостей и lockfile |
| 2026-10-07 20:23Z | WP-BACKEND-01 | WP-BACKEND-01: QUESTION о хранении speaker_count для deferStart — ANSWER: ок (A-5); контракт /start вписан в WP-API-PROJECTS-01 | сообщение product-backend; safe_edit WP-API-PROJECTS-01 п. 8 |
| 2026-10-07 20:23Z | — | A-5 recorded | — |
| 2026-10-07 20:20Z | WP-BACKEND-01 | WP-BACKEND-01: UNLOCK graph (UC-400..403 детализированы, RQ-058 по D-20, Task UC-400-BE) | сообщение product-backend |
| 2026-10-07 20:20Z | WP-BACKEND-01 | lock transcriber:graph released | orch.py lock |
| 2026-10-07 20:18Z | WP-BACKEND-01 | WP-BACKEND-01: QUESTION о порядке включения входа — ANSWER по D-20 (флаг AUTH_REQUIRED, legacy-принципал «Роман»); WP-FRONTEND-02 извещён о контракте /me в обоих режимах | сообщение product-backend |
| 2026-10-07 20:18Z | — | D-20 recorded | — |
| 2026-10-07 20:17Z | WP-BACKEND-01 | WP-BACKEND-01: LOCK graph выдан (UC-400..403); сессия сообщает о таймаутах GitHub — локальный origin/main = 2570d0a актуален, fetch перед push | сообщение product-backend |
| 2026-10-07 20:17Z | WP-BACKEND-01 | WP-BACKEND-01: DISPATCHING -> IN_PROGRESS | сообщение product-backend: ветка создана от 2570d0a, LOCK graph |
| 2026-10-07 20:17Z | WP-BACKEND-01 | lock transcriber:graph acquired | LOCK message: /nacl-sa-uc UC-400..403, FR-003 in-progress |
| 2026-10-07 20:11Z | WP-WORKER-MEMORY-01 | WP-WORKER-MEMORY-01: READY -> DISPATCHING | start command handed to the owner; model opus, effort high; locks transcriber:shared/**, transcriber:worker/package.json |
| 2026-10-07 20:11Z | WP-WORKER-01 | WP-WORKER-01: замок shared/ снят — взят dispatch по обратным кавычкам в строке «нет (контракт из `shared/` только читается)»; пакет shared не правит; строка исправлена | dispatch WP-WORKER-01: locks to take: shared/; dispatch WP-WORKER-MEMORY-01 refused |
| 2026-10-07 20:11Z | WP-WORKER-01 | lock transcriber:shared/ released | orch.py lock |
| 2026-10-07 20:10Z | WP-WEB-MEMORY-01 | WP-WEB-MEMORY-01: READY -> DISPATCHING | start command handed to the owner; model sonnet |
| 2026-10-07 20:10Z | WP-WEB-FEEDBACK-01 | WP-WEB-FEEDBACK-01: READY -> DISPATCHING | start command handed to the owner; model sonnet |
| 2026-10-07 20:10Z | WP-WEB-PROJECTS-01 | WP-WEB-PROJECTS-01: READY -> DISPATCHING | start command handed to the owner; model sonnet |
| 2026-10-07 20:10Z | WP-WORKER-MEMORY-01 | dispatch of WP-WORKER-MEMORY-01 refused: lock transcriber:shared/ is held by WP-WORKER-01 (overlaps shared/**) | orch.py dispatch |
| 2026-10-07 20:10Z | WP-WORKER-01 | WP-WORKER-01: READY -> DISPATCHING | start command handed to the owner; model opus, effort high; locks transcriber:shared/ |
| 2026-10-07 20:10Z | WP-FRONTEND-02 | WP-FRONTEND-02: READY -> DISPATCHING | TASK message to live session; model sonnet |
| 2026-10-07 20:10Z | WP-BACKEND-01 | WP-BACKEND-01: READY -> DISPATCHING | TASK message to live session; model opus, effort high; locks transcriber:api/prisma/**, transcriber:.tl/**, transcriber:migrations |
| 2026-10-07 20:10Z | — | Волна 2: у WP-WORKER-MEMORY-01, WP-WEB-PROJECTS-01, WP-WEB-FEEDBACK-01, WP-WEB-MEMORY-01 текст «Слот слияния: после …» перенесён из строки «Зависит от» в строку «Слот слияния» — dispatch читал порядок merge как зависимость разработки; факты не менялись | dispatch --dry-run: refused: depends on WP-WORKER-01/WP-API-* |
| 2026-10-07 20:10Z | — | R-11 closed | ssh 2026-10-07: кэш snap 4.0K, удалены 6 выключенных ревизий snap, pnpm store prune: 2910 файлов / 37 пакетов; df /: 19G used, 10G avail (65%) — цель 8 GB достигнута |
| 2026-10-07 20:09Z | WP-BACKEND-06 | lock transcriber:migrations released | orch.py lock |
| 2026-10-07 20:09Z | WP-BACKEND-06 | WP-BACKEND-06: доставлен на прод — merge 2570d0a669 (squash), миграция program_product_schema применена (лог деплоя), Deploy success, verify --env prod PASS, health/meetings 200 (записей: 26) | reports/verify-WP-BACKEND-06-prod-20261007.md; gh run 37679417337 |
| 2026-10-07 20:08Z | WP-BACKEND-06 | WP-BACKEND-06: VERIFIED_TEST -> PROD | verify --env prod 2570d0a669: reports/verify-WP-BACKEND-06-prod-20261007.md |
| 2026-10-07 20:08Z | WP-BACKEND-06 | WP-BACKEND-06: MERGED -> VERIFIED_TEST | verify --env test 2570d0a669: reports/verify-WP-BACKEND-06-test-20261007.md |
| 2026-10-07 20:08Z | — | R-11 opened for owner | work-packages/WP-INFRA-01-neo4j.md |
| 2026-10-07 20:08Z | — | R-10 closed | ssh 2026-10-07: pnpm не в PATH неинтерактивного ssh (живёт в nvm, деплой грузит nvm.sh явно); /var/lib/snapd/cache всё ещё 3.3G — rm с глобом под sudo не удалил (глоб раскрывает non-root shell); 6 выключенных ревизий snap; df 7.4G avail |
| 2026-10-07 20:05Z | WP-BACKEND-06 | WP-BACKEND-06 merged in the merge queue; released transcriber:api/prisma/**, transcriber:shared/**, transcriber:package.json, transcriber:pnpm-lock.yaml, transcriber:api/src/server.ts, transcriber:worker/src/job-processor.ts, transcriber:worker/src/queues.ts, transcriber:worker/src/index.ts, transcriber:.tl/**, transcriber:api/package.json, transcriber:worker/package.json, transcriber:web/package.json, transcriber:shared/package.json | orch.py deliver: 2570d0a669 |
| 2026-10-07 20:05Z | WP-BACKEND-06 | WP-BACKEND-06: ACCEPTED -> MERGED | gh pr merge --squash: 2570d0a669 (https://github.com/ITSalt/transcriber/pull/12) |
| 2026-10-07 20:05Z | — | Сетевой сбой на машине оркестратора ~19:50–20:05Z: TCP 443/22 недоступны к GitHub, своей VM, Google, npm, mail.ru; traceroute обрывался на шлюзе провайдера 83.147.36.1; владелец с Mac в это же время достигал VM по ssh → проблема аплинка этой машины, не GitHub. Восстановилось само; push и гейты BACKEND-06 зелёные | tasks b5j4acfuc, b9psygmub, диагностика curl/traceroute 20:04Z |
| 2026-10-07 19:45Z | — | R-9 closed | ssh 2026-10-07 22:44 (время VM): docker exec learn-postgres pg_dump -U postgres -d transcrib -Fc → /home/deploy/backup/transcrib-before-backend06-20261007-2244.dump, 943839 байт; df /: 7.4G avail |
| 2026-10-07 19:45Z | — | P-13 closed | answered by D-19 |
| 2026-10-07 19:45Z | — | D-19 recorded | answer to P-13 |
| 2026-10-07 19:44Z | WP-INFRA-01 | R-7: на проде api/.env и worker/.env — симлинки на /opt/transcrib/.env (один файл для compose, деплоя и воркера); README-neo4j не требует правки | ssh ls -la 2026-10-07 |
| 2026-10-07 19:44Z | — | R-10 opened for owner | work-packages/WP-INFRA-01-neo4j.md |
| 2026-10-07 19:44Z | — | R-6 closed | ssh 2026-10-07: sudo rm -rf /var/lib/snapd/cache/* выполнен; df /: 21G used, 7.4G avail (75%) — видимого выигрыша нет (вероятно, кэш был уже меньше или файлы ещё удерживались); /home/deploy/.local/share/pnpm/store = 2.0G |
| 2026-10-07 19:44Z | — | R-7 closed | ssh 2026-10-07: /opt/transcrib/.env — обычный файл (1285 B, 0600); /opt/transcrib/api/.env и /opt/transcrib/worker/.env — симлинки на ../.env; ecosystem.config.cjs есть. Все три читателя (compose, шаг деплоя, воркер/graph:migrate) видят один и тот же файл; таблица в README-neo4j верна, править не нужно |
| 2026-10-07 19:43Z | WP-BACKEND-06 | WP-BACKEND-06 queued for merge (sequential) | https://github.com/ITSalt/transcriber/pull/12 |
| 2026-10-07 19:43Z | WP-BACKEND-06 | WP-BACKEND-06: accepted at 3fa3500f47b74e6473c19285bb65d4e27aa09e01 | report reports/wp-backend-06-review-20261007-r2.md |
| 2026-10-07 19:43Z | WP-BACKEND-06 | WP-BACKEND-06: REVIEW -> ACCEPTED | 3fa3500f47; reports/wp-backend-06-review-20261007-r2.md |
| 2026-10-07 19:42Z | — | R-9 opened for owner | work-packages/WP-BACKEND-06-contract.md |
| 2026-10-07 19:42Z | — | R-8 dropped | на хосте нет pg_dump: Postgres прода живёт в контейнере learn-postgres (PG 17.9, .tl/deploy-plan.md:17); заменён на R-9 через docker exec |
| 2026-10-07 18:55Z | WP-BACKEND-06 | WP-BACKEND-06: REVISE -> REVIEW | 3fa3500f47; report reports/wp-backend-06-review-20261007-r2.md |
| 2026-10-07 18:44Z | WP-BACKEND-01 | Из ревью WP-BACKEND-06 (L1, L2) в WP-BACKEND-01 и WP-WORKER-01 вписаны обязательства: снятие DEFAULT/NOT NULL на meetings.workspace_id, сверка ProtocolVersion по FR-005:59-78, down.sql для своих миграций | reports/wp-backend-06-review-20261007.md; safe_edit WP-BACKEND-01, WP-WORKER-01 п. 8 |
| 2026-10-07 18:44Z | WP-BACKEND-06 | WP-BACKEND-06: REVIEW -> REVISE | reports/wp-backend-06-review-20261007.md: 1 пункт — down.sql и правило восстановления для нетранзакционной миграции (условие merge по D-3); остальное принято, миграция и совместимость подтверждены на postgres:16 |
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
