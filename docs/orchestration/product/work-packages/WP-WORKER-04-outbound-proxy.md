# WP-WORKER-04 — Исходящий прокси для OpenRouter (OUTBOUND_PROXY_URL, undici ProxyAgent, только LLM-трафик)

| Поле | Значение |
|------|----------|
| Поток | worker (area) |
| Репозиторий | /home/cloudpc/projects/transcriber |
| Базовая ветка | main |
| Линия | main |
| Рабочая ветка | `feature/wp-worker-04-outbound-proxy` |
| Worktree | `.claude/worktrees/wp-worker-04-outbound-proxy` (создаёт `claude -w wp-worker-04-outbound-proxy`) |
| Заголовок PR | `[PRODUCT] WP-WORKER-04: Исходящий прокси для OpenRouter (OUTBOUND_PROXY_URL, undici ProxyAgent, только LLM-трафик)` |
| Сессия | `product-worker` |
| Модель | `sonnet` |
| Усилие | — |
| Почему такая модель | модель реализатора по умолчанию (orch.yaml models.implement) |
| Режим | nacl: `/nacl-tl-dev` (TECH-задача) по TDD, `/nacl-tl-review`; граф не трогать |
| Команды методологии: разрешены | nacl: `nacl-tl-dev-be`, `nacl-tl-dev`, `nacl-tl-fix`, `nacl-tl-review`, `nacl-tl-regression-test`, `nacl-tl-verify-code`, `nacl-tl-sync`, `nacl-tl-docs`, `nacl-tl-stubs`, `nacl-sa-uc`, `nacl-sa-domain`, `nacl-sa-feature`, `nacl-sa-validate`, `nacl-tl-plan`, `nacl-tl-status` |
| Команды методологии: запрещены | `nacl-tl-release`, `nacl-tl-deploy`, `nacl-tl-deliver`, `nacl-tl-hotfix`, `nacl-tl-ship`, `nacl-tl-conductor`, `nacl-tl-full`, `nacl-goal`, `nacl-publish` |
| Разрешённые пути | `worker/{tsconfig.json,vitest.config.ts}`, `worker/test/**`, `worker/src/{asr,jobs,lib,llm}/**`, `worker/src/{config.ts,config.test.ts,logger.ts,shutdown.ts,shutdown.test.ts,job-processor.test.ts,queues.test.ts,queues.regression.test.ts}` |
| Общие пути, которые трогает пакет | `**/package.json` (только `worker/package.json`: зависимость `undici`), `pnpm-lock.yaml`; вне разрешённых путей по A-12: `.env.example` (одна переменная) |
| Миграции | нет |
| Ресурсы (замки) | нет |
| Тестовая БД и порты | нет; нет |
| Слот слияния | <место в очереди слияний, задаётся при приёмке> |
| Контракт | `ILlmProvider`/`ILlmCompletionProvider` без изменений; адаптер OpenRouter из WP-WORKER-03 получает `dispatcher` |
| Зависит от | WP-WORKER-03 (в main, 65e0113706) |
| Размер | S |
| Спецификация | ADR-007, TECH-011, DEC-001; NFR: прокси только для LLM-трафика (как REQ-NFR-proxy-scope-llm-only в procontent) |
| Граф | нет |
| Решения | D-32, D-33, D-34 (прокси владельца, переменная `OUTBOUND_PROXY_URL` уже в прод-.env), A-12 (`.env.example`) |

Общие пути этого репозитория (объяви те, что трогает пакет): `pnpm-lock.yaml`, `package.json`, `**/package.json`, `shared/**`, `api/prisma/**`, `.tl/{status.json,master-plan.md,changelog.md,release-status.json,deploy-plan.md}`, `.tl/external-contracts/**`, `graph-infra/**`, `config.yaml`, `CLAUDE.md`, `api/src/server.ts`, `worker/src/index.ts`, `worker/src/job-processor.ts`, `worker/src/queues.ts`, `web/src/App.tsx`, `web/src/i18n/**`.
Ресурсы этого репозитория, требующие замка: `migrations`, `graph` (по запросу: LOCK/UNLOCK, см. раздел 6), `dev-stack` (по запросу: LOCK/UNLOCK, см. раздел 6).

## 0. Подготовка worktree

1. Переключи worktree на ветку пакета: `git fetch origin && git switch -c feature/wp-worker-04-outbound-proxy origin/main`.
2. Подготовь worktree (команды из `orch.yaml`, выполнять внутри worktree):

   ```bash
   pnpm install --frozen-lockfile
   pnpm --filter @transcrib/api run db:generate
   ```
3. Правь только разрешённые пути; общие пути — только объявленные в шапке и после получения замка.

## 1. Факты

- После доставки WP-WORKER-03 живой сценарий на проде провалился: OpenRouter за Cloudflare отвечает `HTTP 403 {"success":false,"error":"Access denied by security policy."}` на любой запрос с IP прод-VM (RU), включая `GET /api/v1/models` без ключа; `api.anthropic.com` с VM — тоже 403. Прод возвращён на kie.ai (D-33). Дефект: `bugs/BUG-3-verify-wp-worker-03-prod.md`.
- Через форвард-прокси владельца (tinyproxy в Далласе, `OUTBOUND_PROXY_URL`, схема `http://`, тот же, что у procontent/learn/ptd-back на этой VM) с прод-VM: `/api/v1/models` → 200 за 1,6 с; `chat/completions` с `anthropic/claude-haiku-5.5` → 200 за 2,2 с (проверено оркестратором 2026-10-08 16:54Z). Значение переменной уже дописано в `/opt/transcrib/.env`; в код не попадает.
- Node 20/22 `fetch` не читает `HTTPS_PROXY`; нужен `undici` `ProxyAgent` как `dispatcher` запроса. В `worker/package.json` зависимости `undici` нет (`@deepgram/sdk`, `@aws-sdk/client-s3`, `bullmq`, …) — добавить `undici` (procontent использует `^6.26.0`; взять версию, совместимую с Node 20 из `engines`, и зафиксировать `pnpm-lock.yaml`).
- Готовая реализация владельца — `procontent/backend/src/lib/outbound-proxy.ts` (ниже полностью, портирована из ptd-back ← learn): один `ProxyAgent` на URL, **HTTP/1.1 форсируется на обеих ногах туннеля** (`allowH2: false`, `ALPNProtocols: ['http/1.1']` в `connect` и `requestTls`) — иначе HTTP/2 через CONNECT к Cloudflare-апстримам интермиттентно виснет (~30 с); SOCKS отвергается на старте; учётка маскируется в логах; прокси применяется **только** к трафику LLM-провайдеров (хранилище, Deepgram, S3 — напрямую).
- Адаптер OpenRouter: `worker/src/llm/openrouter.ts:131-141` — `fetch(\`${this.baseUrl}/chat/completions\`, { method, headers, body, signal })`; kie.ai (`worker/src/llm/kieai.ts`, `worker/src/memory/kieai-completion.ts`) доступен из РФ напрямую и прокси не требует.
- Переменные LLM и их валидация: `worker/src/config.ts` (`LlmEnvSchema`), фабрика `worker/src/llm/provider.ts` (`resolveLlmSettings`, `createLlmProvider`, `createCompletionProvider`), стартовая строка `worker/src/logger.ts`.

### Исходник для порта (procontent, `backend/src/lib/outbound-proxy.ts`, без изменений)

```ts
/**
 * Диспетчер исходящих запросов через форвард-прокси (DEC-083).
 *
 * Портирован из ptd-back (`src/modules/mod-integrations/outbound-proxy.ts`), куда
 * попал из проекта learn. Все три проекта ходят в один и тот же tinyproxy в Далласе.
 *
 * Зачем вообще: OpenRouter отвечает РФ-адресам HTTP 403 «Access denied by security
 * policy». Замер со стенда 2026-08-12 — напрямую 403 за 0.08 с, через прокси 200 и
 * 664 КБ каталога за 1.6 с.
 *
 * ВАЖНО — не «упрощать» опции ProxyAgent. HTTP/2 через CONNECT интермиттентно виснет
 * (~30 с, частичный ответ и простой) на Cloudflare-апстримах при высоком RTT
 * (~180 мс РФ↔Даллас). OpenRouter стоит за Cloudflare, поэтому HTTP/1.1 форсируется
 * на ОБЕИХ ногах туннеля — и на CONNECT до прокси, и на TLS до апстрима.
 * `allowH2: false` добавлен сверх списка ALPN: начиная с undici 8 агент
 * договаривается до h2 вопреки `ALPNProtocols`, если не запретить явно.
 * Свойство охраняется тестом outbound-proxy.alpn.test.ts, а не только этим текстом.
 *
 * ВАЖНО — прокси применяется ТОЛЬКО к трафику API провайдеров (REQ-NFR-proxy-scope-llm-only).
 * Хранилище VK Cloud, CDN, загрузка исходников и скачивание результатов, remove.bg
 * ходят напрямую: трансатлантический хоп на пути данных — это и задержка, и лишняя
 * точка отказа там, где её сейчас нет.
 *
 * @module lib/outbound-proxy
 */
import { ProxyAgent } from 'undici';
import type { Dispatcher } from 'undici';

/** Имя переменной окружения с адресом прокси. Пусто/нет — прямое соединение. */
export const OUTBOUND_PROXY_ENV_VAR = 'OUTBOUND_PROXY_URL';

/** Один агент на один URL прокси — создаётся однажды и переиспользуется. */
const agents = new Map<string, ProxyAgent>();

export class OutboundProxyConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'OutboundProxyConfigError';
  }
}

/**
 * Доп. TLS-опции, подмешиваемые в обе ноги туннеля — например, приватный CA, если
 * прокси переподписывает трафик. Форсирование HTTP/1.1 применяется ПОСЛЕ них и
 * перекрыть его этими опциями нельзя.
 */
export interface OutboundTlsOptions {
  ca?: string | Buffer | Array<string | Buffer>;
  rejectUnauthorized?: boolean;
  servername?: string;
}

/**
 * Спрятать учётку в адресе прокси, чтобы она никогда не утекла в лог.
 * `http://<логин>:<пароль>@host:3128` → `http://<логин>:<пароль>@host:3128`.
 */
export function maskProxyUrl(proxyUrl: string): string {
  return proxyUrl.replace(/\/\/[^@/]*@/, '//***:***@');
}

/**
 * Разобрать и проверить адрес прокси.
 *
 * Схема обязана быть http/https: undici туннелирует через HTTP CONNECT и SOCKS не
 * умеет, поэтому `socks5://` отвергается здесь, а не на первой генерации.
 *
 * @throws {OutboundProxyConfigError} если строка не разбирается или схема не та.
 */
function assertValidProxyUrl(proxyUrl: string): void {
  let parsed: URL;
  try {
    parsed = new URL(proxyUrl);
  } catch {
    throw new OutboundProxyConfigError(
      `${OUTBOUND_PROXY_ENV_VAR} не разбирается как URL: ${maskProxyUrl(proxyUrl)}`,
    );
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new OutboundProxyConfigError(
      `${OUTBOUND_PROXY_ENV_VAR} обязан быть http(s)-прокси — SOCKS undici не поддерживает ` +
        `(получено: ${parsed.protocol}//)`,
    );
  }
}

/**
 * Прочитать адрес прокси из окружения. Пустая строка и отсутствие переменной
 * одинаково означают прямое соединение.
 *
 * @throws {OutboundProxyConfigError} если переменная задана, но негодна.
 */
export function resolveOutboundProxyUrl(
  env: NodeJS.ProcessEnv = process.env,
): string | null {
  const raw = (env[OUTBOUND_PROXY_ENV_VAR] ?? '').trim();
  if (raw === '') return null;
  assertValidProxyUrl(raw);
  return raw;
}

/**
 * Проверка конфигурации на старте приложения (fail fast).
 *
 * Без неё опечатка в переменной проявилась бы не при загрузке, а на первой
 * генерации через сорок минут — и выглядела бы как отказ провайдера.
 *
 * @returns замаскированный адрес прокси либо null, если включён прямой режим.
 */
export function assertOutboundProxyConfig(env: NodeJS.ProcessEnv = process.env): string | null {
  const url = resolveOutboundProxyUrl(env);
  return url === null ? null : maskProxyUrl(url);
}

/**
 * Общий диспетчер для `proxyUrl`, либо `undefined`, когда прокси не настроен
 * (прямой режим — прежнее поведение).
 *
 * Создание `ProxyAgent` на каждый запрос течёт сокетами, поэтому агент кэшируется:
 * функцию безопасно звать на каждом исходящем вызове.
 */
export function getOutboundDispatcher(
  proxyUrl: string | null,
  log?: (msg: string, ctx: Record<string, unknown>) => void,
  tlsOptions?: OutboundTlsOptions,
): Dispatcher | undefined {
  if (!proxyUrl) return undefined;

  const cached = agents.get(proxyUrl);
  if (cached) return cached;

  assertValidProxyUrl(proxyUrl);

  const agent = new ProxyAgent({
    uri: proxyUrl,
    // Ни при каких опциях вызывающего не даём договориться до HTTP/2.
    allowH2: false,
    // HTTP/1.1 на ноге CONNECT до самого прокси.
    connect: { ...tlsOptions, ALPNProtocols: ['http/1.1'] },
    // HTTP/1.1 на ноге TLS до апстрима (после CONNECT).
    // ALPNProtocols раскрывается ПОСЛЕДНИМ намеренно: вызывающий может добавить
    // приватный CA, но не может ослабить форсирование HTTP/1.1.
    requestTls: { ...tlsOptions, ALPNProtocols: ['http/1.1'] },
  });
  agents.set(proxyUrl, agent);

  log?.('исходящий прокси настроен (HTTP/1.1 форсирован на обеих ногах)', {
    proxyUrl: maskProxyUrl(proxyUrl),
  });

  return agent;
}

/**
 * ЕДИНСТВЕННОЕ место, где живёт правило «идти через прокси или напрямую».
 *
 * Намеренно не тернарник на каждом из вызовов fetch: общего HTTP-клиента в проекте
 * нет, есть три независимых семейства адаптеров со скопированными блоками fetch, и
 * расползание одного правила по копиям здесь уже дорого обходилось.
 *
 * @param useProxy - признак use_outbound_proxy из строки provider_configs.
 * @returns диспетчер либо `undefined`; `undefined` undici игнорирует, поэтому
 *   прямой режим сохраняет прежнее поведение байт-в-байт.
 */
export function outboundDispatcherFor(useProxy: boolean | undefined): Dispatcher | undefined {
  if (!useProxy) return undefined;
  return getOutboundDispatcher(resolveOutboundProxyUrl());
}

/**
 * Сбросить кэш агентов. Только для тестов: позволяет прогону переинициализироваться
 * с другим адресом прокси, не утекая сокетами предыдущего агента.
 */
export function resetOutboundDispatcher(): void {
  for (const agent of agents.values()) {
    void agent.close();
  }
  agents.clear();
}
```

## 2. Объём

1. `worker/src/lib/outbound-proxy.ts` — порт модуля выше (имена экспортов сохранить: `OUTBOUND_PROXY_ENV_VAR`, `maskProxyUrl`, `resolveOutboundProxyUrl`, `assertOutboundProxyConfig`, `getOutboundDispatcher`, `outboundDispatcherFor`, `resetOutboundDispatcher`), зависимость `undici` в `worker/package.json` + `pnpm-lock.yaml` (frozen lockfile в CI должен пройти). Опции `ProxyAgent` не упрощать (см. комментарий об HTTP/1.1).
2. `worker/src/llm/openrouter.ts`: все вызовы `fetch` к OpenRouter получают `dispatcher: outboundDispatcherFor(this.useProxy)`; `useProxy` — опция конструктора, по умолчанию `true`, когда `OUTBOUND_PROXY_URL` задан (решает фабрика в `provider.ts`: `resolveLlmSettings` читает `OUTBOUND_PROXY_URL` через `assertOutboundProxyConfig` и падает на старте при невалидном URL/схеме, как при неверном `LLM_PROVIDER`). kie.ai-провайдеры прокси НЕ используют.
3. Стартовая строка (`logger.ts`/`provider.ts`): дополнить `proxy: <маскированный URL | direct>`; учётка никогда не логируется (`maskProxyUrl`).
4. `.env.example`: `OUTBOUND_PROXY_URL=` с комментарием (только для OpenRouter; `http://`/`https://`; пусто = напрямую); заодно одна строка про `LLM_TIMEOUT_MS` (целое мс, минимум 1000) и про связку `LLM_PROVIDER`/`LLM_MODEL` (менять вместе: при `kieai` только `claude-sonnet-4-6`) — закрывает Low-2 ревью WP-WORKER-03.
5. Low-1 ревью WP-WORKER-03: тест в `worker/src/memory/register.test.ts`, где `overrides.env` содержит `OPENROUTER_API_KEY` без `overrides.llm`, и `deps.llm()` — `OpenRouterLlmProvider`.
6. Не менять: промпты, классификацию ошибок, kie.ai, Deepgram, S3; никакого глобального `setGlobalDispatcher`.

### Не входит

- merge, деплой, PROD, запись в БД
- другие модули и рабочее пространство оркестратора
- файлы вне разрешённых путей; общие пути, не объявленные выше
- подъём версий и release notes, если не перечислены выше

## 3. Критерии приёмки

1. Тесты `outbound-proxy.test.ts`: без переменной — `undefined` (прямое соединение); `http://`/`https://` — один и тот же `ProxyAgent` на повторных вызовах; `socks5://` и мусор — `OutboundProxyConfigError` с замаскированной учёткой; ALPN-тест: опции агента содержат `allowH2: false` и `ALPNProtocols: ['http/1.1']` в `connect` и `requestTls` (как `outbound-proxy.alpn.test.ts` в procontent).
2. Тесты адаптера: при заданном прокси `fetch` вызывается с `dispatcher` (подменённый fetch проверяет опцию), без прокси — без `dispatcher`; kie.ai-провайдеры `dispatcher` не получают.
3. Тест фабрики/конфига: невалидный `OUTBOUND_PROXY_URL` → ошибка конфигурации на старте; валидный — стартовая строка содержит маскированный адрес, не учётку.
4. `pnpm install --frozen-lockfile` в CI проходит с новой зависимостью; `pnpm -r typecheck`, `pnpm test` зелёные.
5. В PR: таблица переменных (`OUTBOUND_PROXY_URL` + уточнения по `LLM_*`) и что произойдёт при их отсутствии. Живая проверка через прокси — оркестратором после доставки (у сессии нет ни ключа, ни адреса прокси — не запрашивать).

## 4. Порядок сдачи

- PR из `feature/wp-worker-04-outbound-proxy` в `main`; не мержить.
- Тело PR = отчёт разработки + `Deviations` (чем результат отличается от пакета и почему).
- Затем сообщение `product-coord`: `[PRODUCT] READY WP-WORKER-04 :: <sha> :: ref=<PR URL>`.

## 5. Start prompt

```text
Прочитай /home/cloudpc/projects/transcriber-orch/docs/orchestration/product/work-packages/WP-WORKER-04-outbound-proxy.md и выполни. Сначала раздел 0 (подготовка worktree). Ветка feature/wp-worker-04-outbound-proxy от origin/main, PR в main, не мержить. По готовности — сообщение product-coord: [PRODUCT] READY WP-WORKER-04 :: <sha> :: ref=<PR URL>

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
cd /home/cloudpc/projects/transcriber && claude -w wp-worker-04-outbound-proxy --model sonnet --name product-worker "Прочитай /home/cloudpc/projects/transcriber-orch/docs/orchestration/product/work-packages/WP-WORKER-04-outbound-proxy.md и выполни. Сначала раздел 0 (подготовка worktree). Ветка feature/wp-worker-04-outbound-proxy от origin/main, PR в main, не мержить. По готовности — сообщение product-coord: [PRODUCT] READY WP-WORKER-04 :: <sha> :: ref=<PR URL>

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
- Пришли `product-coord`: `[PRODUCT] QUESTION WP-WORKER-04 :: отказ: <точный текст отказа> :: ref=<команда>`; продолжай работу, которой это не нужно, или жди `ANSWER`.
- Ресурсы по запросу (`graph`, `dev-stack`): перед использованием пришли `product-coord`: `[PRODUCT] LOCK WP-WORKER-04 :: <ресурс> :: ref=<зачем>` и жди `ACK`; как только закончишь — `[PRODUCT] UNLOCK WP-WORKER-04 :: <ресурс> :: ref=<результат>`. READY возвращает все замки по запросу.

## Пересдачи

<Циклы REVISE: дата, пункты, коммит.>
