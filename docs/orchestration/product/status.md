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
| [WP-FRONTEND-01](work-packages/WP-FRONTEND-01-design-system.md) | frontend | Дизайн-система ITSALT и каркас приложения | READY | product-frontend | — | 2026-10-07 |
| [WP-FRONTEND-02](work-packages/WP-FRONTEND-02-login-tasks.md) | frontend | Экран входа, переключатель пространств, список задач | READY | product-frontend | — | 2026-10-07 |
| [WP-BACKEND-02](work-packages/WP-BACKEND-02-projects-context.md) | backend | Проекты и контекст встречи: в распознавание и в протокол | CANCELLED (заменён WP-API-PROJECTS-01 (D-15, поток api-projects)) | product-backend | — | 2026-10-07 |
| [WP-FRONTEND-03](work-packages/WP-FRONTEND-03-projects-context-ui.md) | frontend | Проекты и форма контекста перед распознаванием | CANCELLED (заменён WP-WEB-PROJECTS-01 (D-15)) | product-frontend | — | 2026-10-07 |
| [WP-BACKEND-03](work-packages/WP-BACKEND-03-feedback.md) | backend | История версий протокола и приём обратной связи | CANCELLED (заменён WP-API-FEEDBACK-01 (D-15, поток api-feedback)) | product-backend | — | 2026-10-07 |
| [WP-FRONTEND-04](work-packages/WP-FRONTEND-04-feedback-ui.md) | frontend | Режим обратной связи по протоколу | CANCELLED (заменён WP-WEB-FEEDBACK-01 (D-15)) | product-frontend | — | 2026-10-07 |
| [WP-BACKEND-04](work-packages/WP-BACKEND-04-project-memory.md) | backend | Память проекта: граф задач и решений, сводка, перенос между встречами | CANCELLED (заменён WP-API-MEMORY-01 (D-15, поток api-memory)) | product-backend | — | 2026-10-07 |
| [WP-FRONTEND-05](work-packages/WP-FRONTEND-05-project-memory-ui.md) | frontend | Реестр задач и решений проекта, очередь подтверждений | CANCELLED (заменён WP-WEB-MEMORY-01 (D-15)) | product-frontend | — | 2026-10-07 |
| [WP-BACKEND-05](work-packages/WP-BACKEND-05-neo4j-prod.md) | backend | Neo4j для памяти проекта: сервис, лимиты памяти, бэкап, CI | CANCELLED (заменён WP-INFRA-01 и WP-WORKER-MEMORY-01 (D-15)) | product-backend | — | 2026-10-07 |
| [WP-BACKEND-06](work-packages/WP-BACKEND-06-contract.md) | backend | Контракт программы: схема БД, контракты shared, зависимости | READY | product-backend | — | 2026-10-07 |
| [WP-WORKER-01](work-packages/WP-WORKER-01-context-asr-llm.md) | worker | Контекст встречи в Deepgram и в промпт протокола, метаданные генерации | READY | product-worker | — | 2026-10-07 |
| [WP-WORKER-02](work-packages/WP-WORKER-02-project-memory.md) | worker | Память проекта в Neo4j: извлечение, сопоставление, сводка | CANCELLED (создан в неверном потоке; заменён WP-WORKER-MEMORY-01 (D-15)) | product-worker | — | 2026-10-07 |
| [WP-INFRA-01](work-packages/WP-INFRA-01-neo4j.md) | infra | Neo4j памяти проекта: сервис, лимиты, бэкап, CI, шаг деплоя | READY | product-infra | — | 2026-10-07 |
| [WP-WEB-PROJECTS-01](work-packages/WP-WEB-PROJECTS-01-projects-context.md) | web-projects | Проекты и форма контекста перед распознаванием | READY | product-web-projects | — | 2026-10-07 |
| [WP-WEB-FEEDBACK-01](work-packages/WP-WEB-FEEDBACK-01-feedback.md) | web-feedback | Режим обратной связи по протоколу | READY | product-web-feedback | — | 2026-10-07 |
| [WP-WEB-MEMORY-01](work-packages/WP-WEB-MEMORY-01-registry.md) | web-memory | Реестр задач и решений проекта, очередь подтверждений | READY | product-web-memory | — | 2026-10-07 |
| [WP-API-PROJECTS-01](work-packages/WP-API-PROJECTS-01-projects-context.md) | api-projects | API проектов и контекста встречи, запуск распознавания | READY | product-api-projects | — | 2026-10-07 |
| [WP-API-FEEDBACK-01](work-packages/WP-API-FEEDBACK-01-feedback.md) | api-feedback | API версий протокола и обратной связи, разбор docx | READY | product-api-feedback | — | 2026-10-07 |
| [WP-API-MEMORY-01](work-packages/WP-API-MEMORY-01-registry.md) | api-memory | API памяти проекта: задачи, решения, подтверждения | READY | product-api-memory | — | 2026-10-07 |
| [WP-WORKER-MEMORY-01](work-packages/WP-WORKER-MEMORY-01-pipeline.md) | worker-memory | Память проекта в Neo4j: слой графа, извлечение, сопоставление, сводка | READY | product-worker-memory | — | 2026-10-07 |

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
| R-1 | Узнать память и загрузку прод-VM перед планированием лимитов Neo4j : ssh deploy@transcriber.itsalt.ru 'free -h; nproc; df -h /; docker stats --no-stream' (если домен не ведёт на VM — подставить PRODUCTION_HOST из секретов GitHub) ; expected: объём RAM и свободное место ; then: оркестратор впишет лимиты heap/pagecache в WP-INFRA-01 | work-packages/WP-INFRA-01-neo4j.md | 2026-10-07 |  |

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

## Журнал

Новые сверху. Одна строка на событие: время (UTC), WP, что произошло, чем подтверждено.

<!-- orch:journal -->
| Дата | WP | Событие | Подтверждение |
|------|----|---------|---------------|
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
