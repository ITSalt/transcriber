# Сверка — WP-WORKER-04 (PR https://github.com/ITSalt/transcriber/pull/25, `83f42ec2b1` -> `main @ 65e0113706`) — 2026-10-08

Раунд 1. Дифф: 11 files changed, 462 insertions(+), 9 deletions(-) (файлов: 11).

**Решение: `ACCEPTED WP-WORKER-04`** — порт outbound-proxy логически идентичен исходнику владельца; dispatcher только у OpenRouter, прямой режим без изменений; CI run 37814179431 pass, клон: frozen-lockfile/worker test/typecheck exit 0; мутации M1–M6 красные; дымовой тест с локальным CONNECT-прокси прошёл на Node 24 и Node 22.23 (bundled undici 6.28): CONNECT с учёткой, http/1.1 на апстриме, повторное использование туннеля; находки только Low/Info.

## Пункты REVISE

нет

### Не требуется

- Не менять контракт `outboundDispatcherFor` (чтение `process.env`) и классификацию 407 в этом раунде — backlog.

## Вопросы владельцу

нет

## Принято как есть / backlog

- Low-1: связка фабрика → конструктор → `fetch` не покрыта (мутация M4c зелёная); живая проверка на VM после доставки закрывает риск для прода; backlog: тест `createLlmProvider({OPENROUTER_API_KEY, OUTBOUND_PROXY_URL}).generate()` → `dispatcher instanceof ProxyAgent`.
- Low-2: `useProxy` по `env`, URL по `process.env` — в проде эквивалентно; backlog: передавать URL в конструктор.
- Low-3: 407 от прокси классифицируется как transient (ретраи до исчерпания) — backlog: постоянная ошибка конфигурации.
- Info: висящий CONNECT не рвётся abort'ом до `headersTimeout` (undici, как в исходнике); агенты не закрываются на shutdown (безвредно, `process.exit`); `maskProxyUrl` требует `//`; комментарии «no new dependency» и ссылка на D-33 вместо D-34 в `.env.example`.
- Отклонения PR приняты: `register.test.ts` (п. 5 объёма) и `.env.example` (A-12); `describeLlmSettings` расширена; `process.env` в `outboundDispatcherFor` (как в исходнике); D-17.
- graph: checked — узлы спецификации не меняются (поле «Граф: нет»), diff не трогает `.tl/**`.
- Слот слияния: следующий; merge = прод-деплой; после доставки оркестратор переключает прод: `LLM_PROVIDER=openrouter`, `LLM_MODEL=anthropic/claude-haiku-5.5` (D-32/D-34) и проверяет живой генерацией.

## Автоматические находки

- **пути и замки**: WP-WORKER-04: shared path .env.example changed without the lock
- **пути и замки**: WP-WORKER-04: worker/src/memory/register.test.ts is outside the allowed paths

Дифф ревизии (пересдачи): —

---

## Отчёт рецензента (дословно)

## Отчёт рецензента — PR #25, WP-WORKER-04, head `83f42ec2b13e9280ff68b5719bda18370fe01ab9` → `main @ 65e0113706`

### 1. Вердикт: **ACCEPT**

Все шесть пунктов объёма реализованы там, где заявлено; порт `outbound-proxy.ts` логически совпадает с исходником из пакета; шесть целевых мутаций (M1–M6) ловятся тестами; CI на head зелёный; frozen-lockfile проходит; дымовой тест с локальным CONNECT-прокси проходит на Node 24 (bundled undici 7.29.1) **и на Node 22.23.3 (bundled undici 6.28.1)** — внешний `ProxyAgent` из `undici@6.29.0` работает с глобальным `fetch` обеих версий: прокси видит `CONNECT host:port` и `Proxy-Authorization`, апстрим договаривается до `http/1.1` даже когда сервер предлагает h2 первым, без переменной запрос идёт напрямую. Находки только Low/Info: непокрытая тестом связка «фабрика → конструктор → `fetch`» (мутация M4c осталась зелёной), заявленное отклонение 3 (`process.env` vs `env`) — в проде эквивалентно, и унаследованные от исходника свойства undici (висящий CONNECT не рвётся abort'ом, 407 классифицируется как transient). Ничего из поведения базы не удалено.

### 2. Объём и критерии → код → статус (head `83f42ec`)

| Пункт | Где | Статус |
|---|---|---|
| 1. Порт модуля, экспорты, `undici` | `worker/src/lib/outbound-proxy.ts:1-145` (все 7 экспортов: `OUTBOUND_PROXY_ENV_VAR`, `maskProxyUrl`, `resolveOutboundProxyUrl`, `assertOutboundProxyConfig`, `getOutboundDispatcher`, `outboundDispatcherFor`, `resetOutboundDispatcher`); `allowH2: false` :114, `connect` :116, `requestTls` :119; `worker/package.json:30` `undici ^6.29.0`; `pnpm-lock.yaml` 3 хунка | done |
| 2. `openrouter.ts` dispatcher, `useProxy`; фабрика валидирует `OUTBOUND_PROXY_URL` | `worker/src/llm/openrouter.ts:76-78` (`withDispatcher`), `:85-97` (`useProxy`, default `true`), `:152` (spread в `fetch`); `worker/src/llm/provider.ts:51-56` (`assertOutboundProxyConfig` → `LlmConfigError`), `:73` (`useProxy`), `:89,96` (только OpenRouter-фабрики) | done |
| 3. Стартовая строка `proxy: <mask|direct>` | `provider.ts:81-83`; `logger.ts:31` без изменений | done |
| 4. `.env.example` | `.env.example:68-79` (`OUTBOUND_PROXY_URL`, `LLM_TIMEOUT_MS` «целое, минимум 1000», связка `LLM_PROVIDER`/`LLM_MODEL`) | done (Low-2 WP-WORKER-03 закрыт) |
| 5. Low-1: тест в `register.test.ts` | `worker/src/memory/register.test.ts:41-56` (обёртка `runMemoryUpdate`), `:188-207` (тест: `deps.llm()` instanceOf `OpenRouterLlmProvider`) | done |
| 6. Не менять kie.ai/Deepgram/S3/классификацию, без `setGlobalDispatcher` | список файлов диффа: ни `asr/`, ни `kieai.ts`, ни `kieai-completion.ts`, ни storage; `git grep setGlobalDispatcher` по `worker/src api/src shared/src` — 0 совпадений; `errors.ts` не тронут | done |
| КП-1 тесты модуля | `outbound-proxy.test.ts` (unset → `undefined`; http/https → один агент; socks5/мусор → `OutboundProxyConfigError` без `s3cret`), `outbound-proxy.alpn.test.ts` (recorder вместо `ProxyAgent`: `allowH2`, `connect.ALPNProtocols`, `requestTls.ALPNProtocols`) | done; M1/M2/M5 красные |
| КП-2 тесты адаптера | `openrouter.test.ts:202-242`: с переменной — `dispatcher instanceof ProxyAgent` (оба интерфейса); без / `useProxy:false` — ключа `dispatcher` нет; kie.ai — ключа нет | done; M3 красная |
| КП-3 фабрика/конфиг | `provider.test.ts:55-87` (маска в стартовой строке, kie.ai всегда `direct`, socks/мусор → `LlmConfigError` без учётки), `:101-105` (обе фабрики падают) | done; M4/M6 красные |
| КП-4 CI / frozen / typecheck / test | CI run 37814179431 `Lint + Typecheck + Test` **pass** (2m53s); клон: `pnpm install --frozen-lockfile` exit 0, `pnpm --filter @transcrib/worker test` exit 0, `pnpm -r typecheck` exit 0 | done |
| КП-5 таблица переменных в PR | тело PR, раздел «Переменные» (3 строки, колонка «Если не задана») | done |

### 3. Ответы на вопросы риска

**1. Кросс-версионная совместимость dispatcher.** Одноразовый скрипт в клоне (`worker/smoke-proxy.mts`, удалён): `node:http` CONNECT-прокси (обработчик `'connect'`, pipe через `net`), HTTPS-цель с самоподписанным сертификатом (через `NODE_EXTRA_CA_CERTS`) и `ALPNProtocols: ['h2','http/1.1']` на сервере; `OUTBOUND_PROXY_URL=http://<логин>:<пароль>@127.0.0.1:<port>`; `fetch(url, { dispatcher: outboundDispatcherFor(true) })`. Результат **одинаков на Node v24.21.0 (undici 7.29.1) и Node v22.23.3 (undici 6.28.1)**: прокси получил `CONNECT localhost:<tPort>` с `Proxy-Authorization: Basic dXNlcjpzM2NyZXRQVw==`; ответ 200 `{"ok":true}`; на апстриме `alpnProtocol: 'http/1.1'`, `httpVersion: '1.1'`; второй запрос после паузы 50 мс переиспользовал туннель (1 CONNECT на 2 запроса). Node 22 есть локально (`~/.nvm/versions/node/v22.23.3`) — живая проверка на VM остаётся за оркестратором только для реального прокси, не для совместимости версий.

**2. Отклонение 3 (`process.env` vs `env`).** `provider.ts:73` решает `useProxy` по `env`, а `outbound-proxy.ts:136` берёт URL из `process.env`. Пути с нестандартным `env`: `memory/index.ts:76,99` (`overrides.env` → `createCompletionProvider(env)`) и `jobs/protocol-generation.ts:326` (`createLlmProvider(deps?.env)`). В проде оба — `process.env`: `job-processor.ts:245` вызывает `mod.register({...})` без `overrides`, `deps` в protocol-generation — только тестовая инъекция. Расхождение возможно только в тестах (`overrides.env` с `OUTBOUND_PROXY_URL`, но без него в `process.env` → `useProxy=true`, dispatcher `undefined` → тихо напрямую; и наоборот). Плюс `OpenRouterLlmProvider`, созданный без фабрики, по умолчанию `useProxy=true` и читает `process.env` на каждом запросе — семантика исходника. Серьёзность **Low, backlog**: однострочный фикс (передавать URL в конструктор) ломает контракт исходника «`outboundDispatcherFor` — единственное место правила» и не нужен для прод-сценария.

**3. ALPN/HTTP1 guard.** `outbound-proxy.alpn.test.ts:9-17` подменяет `undici` через `vi.mock` классом-рекордером, который кладёт аргумент конструктора в `captured`; `:27-35` проверяет `allowH2 === false` и `ALPNProtocols: ['http/1.1']` в `connect` и `requestTls`; `:37-45` — что `tlsOptions` с `ALPNProtocols: ['h2']` не ослабляют форсирование. Мутации: **M1** (удалить `allowH2: false`) → 2 failed; **M2** (убрать `ALPNProtocols` из `requestTls`) → 2 failed. Факт по `undici@6.29.0`: `lib/dispatcher/proxy-agent.js` перекрывает `opts.connect` внутренней функцией туннеля (`new Agent({ ...opts, connect: async ... })`), а `lib/core/connect.js:110` ставит `ALPNProtocols: allowH2 ? ['http/1.1','h2'] : ['http/1.1']` ПОСЛЕ `...options` — т.е. в 6.29 форсирование держится на `allowH2: false` и дефолте undici, явные списки — страховка на будущие версии (как и сказано в комментарии про undici 8). Дымовой тест подтвердил `http/1.1` на апстриме фактически.

**4. Кэш агентов и shutdown.** `agents` (`outbound-proxy.ts:27`) закрывается только в `resetOutboundDispatcher` (`:140-145`, «tests only»); `shutdown.ts` агентов не знает. Безвредно: `shutdown.ts:46-48` после закрытия воркеров/ffmpeg/Prisma вызывает `process.exit(0)` (и `process.exit(1)` по таймеру 25 с), открытые keep-alive сокеты выход не задерживают. В исходнике из пакета (строки 226-235) тот же «только для тестов» — порт идентичен.

**5. Таймаут и ProxyAgent.** `AbortSignal.timeout` обрабатывает сам `fetch`: `lib/web/fetch/index.js:2079-2093` в `onConnect(abort)` подписывает `fetchParams.controller.on('terminated', abort)`, abort доходит до `Request.abort` (`lib/core/request.js:223-231`) и рвёт сокет клиента. Эмпирически (оба Node): сценарий B2 (туннель установлен, апстрим молчит) → `TimeoutError` через 508 мс, сокет туннеля на стороне прокси закрыт ≤5 мс после отказа. Оговорка (Info-1): если **сам CONNECT** не отвечает (B1), abort подключить не к чему (`onConnect` ещё не было) — `fetch` отклоняется через 502 мс, но CONNECT-сокет живёт до ответа прокси или `headersTimeout` 300 с (`client.js:240`). «Призрачного запроса» нет: в B3 (CONNECT отвечает через 1,5 с, клиент сдался на 0,5 с) апстрим получил 0 запросов, undici закрыл туннель сразу после установления.

**6. Классификация ошибок.** `openrouter.ts:160-166`: любое исключение `fetch`, кроме `TimeoutError`/`AbortError`, → `OpenRouterLlmError('Network error calling OpenRouter API', { reason: err, isTransient: true })` → BullMQ ретраит. Через прокси сюда попадают: ECONNREFUSED к прокси (цепочка `TypeError: fetch failed <- Error[ECONNREFUSED]: connect ECONNREFUSED 127.0.0.1:1`), 407 (`fetch failed <- Request was cancelled <- AbortError[UND_ERR_ABORTED]: Proxy response (407) !== 200 when HTTP Tunneling`, `proxy-agent.js` ветка `statusCode !== 200`), сбой CONNECT. 407 — по сути постоянная ошибка конфигурации, но ретраится до исчерпания попыток; пакет (п. 6) запрещал менять классификацию — оставлено как есть, кандидат в backlog (Low-3).

**7. Только OpenRouter.** `git grep -E 'dispatcher|undici|setGlobalDispatcher'` по `worker/src api/src shared/src` (без тестов) на head: совпадения только в `lib/outbound-proxy.ts`, `llm/openrouter.ts`, `llm/provider.ts`. `kieai.ts`, `memory/kieai-completion.ts`, `asr/**`, S3-код в диффе отсутствуют. Тест `openrouter.test.ts:233-242` подтверждает отсутствие `dispatcher` у kie.ai при заданной переменной. Дымовой тест E: без переменной прокси не увидел ни одного CONNECT.

**8. Секреты.** Стартовая строка — `provider.ts:82` печатает `s.proxy` = результат `assertOutboundProxyConfig` = `maskProxyUrl` (`:92`); тест `provider.test.ts:61-67` проверяет отсутствие `s3cret`. Ошибки: `outbound-proxy.ts:62` маскирует при нераспарсившемся URL, `:65-67` печатает только `parsed.protocol`; `provider.ts:55` оборачивает `err.message` без добавления сырого значения. Undici: в сообщениях `Proxy response (407) !== 200 when HTTP Tunneling` и `connect ECONNREFUSED <host>:<port>` учётки нет; дымовой тест проверил всю цепочку `cause` (message, stack, собственные свойства) на оба сценария — `s3cretPW` отсутствует. `ProxyAgent` хранит `href` с учёткой в `this[kProxy].uri`, но ни одна ошибка `proxy-agent.js` его не печатает. Оговорка (Info-5): регулярка `maskProxyUrl` требует `//`; значение без `//`, которое при этом не парсится `new URL`, попадёт в `is not a valid URL:` сырым — реалистичные опечатки (`user:pw@host:3128` → схема `user:`, `htp://…`) идут в ветку схемы и не утекают; регулярка та же, что в исходнике.

**9. Lockfile.** `git diff 65e0113706..83f42ec -- pnpm-lock.yaml`: ровно 3 хунка — спецификатор в importer `worker`, `undici@6.29.0` resolution (`engines: node >=18.17`), снапшот `undici@6.29.0: {}`; никакого другого churn. `grep undici@` по lockfile: одна версия 6.29.0 (есть только не связанный `undici-types@6.21.0`). CI с `--frozen-lockfile` прошёл; локально exit 0.

**10. Мутации.** См. таблицу в разделе 6. Все шесть требуемых — красные; дополнительная **M4c** (`provider.ts:89,96` `useProxy: s.useProxy` → `useProxy: false`) — **зелёная** (60/60) → Low-1.

**11. Что база позволяла и что ушло.** Ничего не удалено. Прямой режим: `openrouter.ts:152` добавляет `...withDispatcher(undefined)` = `...{}`; строки `method/headers/body/signal` в диффе не тронуты; тест `openrouter.test.ts:218-231` утверждает `'dispatcher' in call[1] === false` (ключа нет), полного побайтного сравнения объекта опций нет — но других изменений в объекте нет по диффу. Стартовая строка изменилась (`… proxy: direct` добавлен): единственный потребитель `describeLlmSettings` в базе — `logger.ts:31`; парсеров строки в репозитории нет (`git grep 'llm provider:'` по base: только `provider.ts`/`logger.ts`). `describeLlmSettings` обратно совместима (`Partial<Pick<…,'proxy'>>`); `LlmSettings` получил два обязательных поля, конструируется только в `provider.ts`. Фабрики, kie.ai-ветки, `LlmConfigError`-ветки базы (`provider.ts:45,61,64`) на месте.

### 4. Находки по убыванию серьёзности

**Low-1 — `worker/src/llm/provider.ts:89,96` → `openrouter.ts:97,152`: связка фабрика → конструктор → `fetch` не покрыта.** Сценарий: рефакторинг роняет `useProxy: s.useProxy` или передаёт `false` → на проде с `OUTBOUND_PROXY_URL` воркер идёт напрямую → снова 403 от Cloudflare, а все тесты зелёные (мутация M4c: 60/60 passed). Требовать (backlog или следующий раунд, не блокер — живая проверка оркестратора на VM это покроет): тест `createLlmProvider({ OPENROUTER_API_KEY, OUTBOUND_PROXY_URL }).generate(...)` с подменённым `fetch` → `dispatcher instanceof ProxyAgent`.

**Low-2 — `provider.ts:73` vs `outbound-proxy.ts:136` (заявленное отклонение 3).** `useProxy` считается по `env`, URL для диспетчера — из `process.env`. В проде эквивалентно (см. вопрос 2); расхождение достижимо только через `memory/index.ts:76` `overrides.env` / `protocol-generation.ts:326` `deps?.env` в тестах → тихий прямой режим или наоборот. Backlog: передавать разрешённый URL в `OpenRouterLlmProvider` (`proxyUrl`) и звать `getOutboundDispatcher(this.proxyUrl)`; сейчас не требовать — это отход от контракта исходника.

**Low-3 — `openrouter.ts:160-166`: 407 от прокси = transient.** Неверная учётка прокси → `Network error calling OpenRouter API` с `isTransient: true` → полные ретраи BullMQ, затем FAILED; корень (`Proxy response (407)`) виден только в `reason.cause.cause`. По пакету классификация намеренно не менялась. Backlog: признак `UND_ERR_ABORTED` + `Proxy response (4xx)` → постоянная ошибка конфигурации.

**Info-1 — undici, не PR:** висящий CONNECT (прокси принял TCP, не отвечает) abort'ом не рвётся — сокет живёт до ответа или `headersTimeout` 300 с (`undici/lib/dispatcher/client.js:240`); отменённый запрос на апстрим не уходит (сценарий B3: 0 обращений). Идентично исходнику.

**Info-2 — undici, не PR:** после abort активного запроса undici открывает один дополнительный пустой CONNECT (B2#3 в логе), закрывается при `agent.close()`/idle-таймауте прокси; следующий запрос его переиспользует.

**Info-3 — `outbound-proxy.ts:27,140-145` / `shutdown.ts:46-48`:** агенты не закрываются на shutdown; безвредно из-за явного `process.exit`; совпадает с исходником.

**Info-4 — `outbound-proxy.ts:116`:** в undici 6.29 опция `connect` `ProxyAgent` перекрывается внутренне (`proxy-agent.js`, `new Agent({ ...opts, connect: async … })`; TLS-опции ноги до прокси — `proxyTls`), а `connect.js:110` строит ALPN из `allowH2`. Для `http://`-прокси нога CONNECT без TLS — неважно; форсирование фактически обеспечено `allowH2: false`. Порт верен исходнику; менять не нужно.

**Info-5 — `outbound-proxy.ts:47,62`:** `maskProxyUrl` маскирует только при наличии `//`; контрпример `s3cret@host:3128` (не парсится, нет `//`) уходит в сообщение сырым. Реалистичные опечатки безопасны (см. вопрос 8). Та же регулярка в исходнике.

**Info-6 — комментарии:** `openrouter.ts:5-6` «no new dependency» рядом с «undici ProxyAgent» — противоречие; `.env.example:72` ссылается на D-33, тогда как решение о прокси — D-34 (`outbound-proxy.ts:2` ссылается на оба).

Регрессий относительно базы нет.

### 5. Отклонения из тела PR

1. `register.test.ts` и `.env.example` вне разрешённых путей — **принято**: первый прямо требуется п. 5 объёма, дифф файла ограничен обёрткой `runMemoryUpdate` (`:41-56`) и одним тестом (`:188-207`); второй — A-12, одна переменная плюс две строки пояснений по п. 4.
2. `describeLlmSettings` расширена опциональным `proxy`, тест стартовой строки обновлён — **принято**: требование п. 3, сигнатура обратно совместима.
3. `outboundDispatcherFor` читает `process.env` — **принято** как Low-2/backlog (в проде эквивалентно; соответствует исходнику).
4. Без синхронизации `AGENTS.md`/`CLAUDE.md` — **принято** по D-17.
Незаявленных отклонений не найдено: сверка порта с исходником из пакета (строки 83-235 WP) — логика идентична, различия только в текстах сообщений/логов (английский) и в расширении двух сигнатур до `NodeJS.ProcessEnv | Record<string, string | undefined>`.

### 6. CI, размер, тесты, мутации

- **CI** на `83f42ec`: run 37814179431, job `Lint + Typecheck + Test` — **pass**, 2m53s (аннотации — только прежние eslint-warnings в `api/src/features/feedback/routes.test.ts` и deprecation Node 20 для actions).
- **Размер:** 11 файлов, +462/−9 (из них `outbound-proxy.ts` 145, тесты 225).
- **Клон** (`review_clone.sh --keep`, `git rev-parse HEAD` = `83f42ec2b13e9280ff68b5719bda18370fe01ab9`): `pnpm install --frozen-lockfile` → exit 0; `pnpm --filter @transcrib/api run db:generate` → exit 0; `pnpm --filter @transcrib/shared build` → exit 0; `pnpm --filter @transcrib/worker test` → exit 0 (скрипт клона пишет только коды выхода, цифру «1067 passed» воспроизвести не могу — она относится к `pnpm test` всего репозитория, что покрыто CI `pnpm -r run test`); `pnpm -r typecheck` → exit 0.
- **Целевой прогон** (`pnpm exec vitest run` по 5 файлам: `outbound-proxy.test.ts`, `outbound-proxy.alpn.test.ts`, `openrouter.test.ts`, `provider.test.ts`, `register.test.ts`): baseline 5 files / 60 tests passed.
- **Дымовой тест** (Node v24.21.0 и v22.23.3, `NODE_EXTRA_CA_CERTS`, скрипт удалён после прогона): A (через прокси, учётка, ALPN http/1.1, повторное использование туннеля) — PASS; B2 (abort рвёт активный туннель ≤5 мс) — PASS; B1 (висящий CONNECT) — fetch отклонён за 502 мс, сокет не закрыт abort'ом (Info-1); B3 (призрачный запрос) — 0 обращений к апстриму; C (407) и D (ECONNREFUSED) — исключение без учётки в цепочке; E (без переменной) — `undefined`, 0 CONNECT, 200 напрямую.

| Мутация | Файл / правка | Результат |
|---|---|---|
| M1 | `outbound-proxy.ts:114` удалить `allowH2: false` | **red**: 2 failed (`outbound-proxy.alpn.test.ts` оба теста) |
| M2 | `outbound-proxy.ts:119` `requestTls: { ...tlsOptions }` без `ALPNProtocols` | **red**: 2 failed (alpn, оба) |
| M3 | `openrouter.ts:152` удалить `...withDispatcher(...)` | **red**: 1 failed (`openrouter.test.ts` «fetch gets the ProxyAgent as dispatcher») |
| M4 | `provider.ts:73` `useProxy: false` | **red**: 1 failed (`provider.test.ts` «startup line shows the masked address») |
| M4c (доп.) | `provider.ts:89,96` `useProxy: false` в фабриках | **green**: 60/60 → Low-1 |
| M5 | `outbound-proxy.ts:64-68` убрать отказ не-http(s) схемы | **red**: 4 failed (`outbound-proxy.test.ts` ×2, `provider.test.ts` ×2) |
| M6 | `provider.ts:82` `const proxy = 'direct'` | **red**: 1 failed (`provider.test.ts` «masked address») |

После каждой мутации `git checkout` → `git diff --quiet` чист.

### 7. Очистка

Клон `/tmp/claude-1004/-home-cloudpc-projects-transcriber/4310f49e-95eb-4aeb-8d49-40bf49c26179/scratchpad/clones/orch-review.g11hyK` удалён через `review_clone.sh --cleanup` (exit 0; в `clones/` остался только `node-compile-cache`); временные сертификаты `scratchpad/certs` удалены; дымовые скрипты удалены до cleanup (`git status` клона был чист). Основной checkout `/home/cloudpc/projects/transcriber` и `/home/cloudpc/projects/transcriber-orch` не изменялись (`git status` основного checkout показывает только исходное `M config.yaml`). Внешних действий (merge/approve/comment, ssh, БД, реальные прокси/OpenRouter/kie.ai) не выполнялось.
