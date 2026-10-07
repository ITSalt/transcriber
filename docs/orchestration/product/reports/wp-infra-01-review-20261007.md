# Сверка — WP-INFRA-01 (PR https://github.com/ITSalt/transcriber/pull/10, `278863f54e` -> `main @ 343f4a108a`) — 2026-10-07

Раунд 1. Дифф: 7 files changed, 209 insertions(+) (файлов: 7).

**Решение: `REVISE WP-INFRA-01`** — объём выполнен и подтверждён вживую (compose, лимиты D-16, бэкап и восстановление), CI зелёный; но единственная строка PR, исполняемая на проде при каждом деплое, выполняет содержимое `.env` через `eval` (пароль с `$`/пробелом ломает или подменяет деплой), плюс README не говорит, какой файл и когда задавать пароль.

## Пункты REVISE

1. `.github/workflows/deploy-production.yml:63` `eval "$(grep -E '^MEMORY_NEO4J_' .env)"` -> пароль `pa ss` запускает команду `ss` и деплой продолжается с пустым паролем; `Ab$9x` → `unbound variable`, деплой обрывается после `db:migrate:deploy` и до rsync/pm2 (схема новая, процессы старые); `$(...)`/backticks исполняются (воспроизведено ревьюером на точных строках под `set -euo pipefail`) -> требование: читать переменные без выполнения — построчно `case "$line" in MEMORY_NEO4J_URI=*|…) export "$line";; esac` со срезом `\r` (или только `grep -q` наличия URI, а значения пусть читает сам `graph:migrate` через dotenv, как воркер); medium, обязательный.
2. `scripts/README-neo4j.md:11`, `.env.example:40-43` -> владелец поднимает сервис с дефолтным паролем, потом меняет `MEMORY_NEO4J_PASSWORD` — `NEO4J_AUTH` действует только при первом старте на пустом volume, БД остаётся с `memory_dev_password`, приложение не входит; и README не говорит, какой файл читают compose и шаг деплоя (`/opt/transcrib/.env`), а какой — воркер (`worker/.env`) -> требование: в README явно: пароль задаётся в `/opt/transcrib/.env` ДО первого `docker compose up -d memory-neo4j`; какие файлы читают compose, шаг деплоя и воркер (уточнение по R-7, если факт окажется иным, пришлю ANSWER); low, обязательный (ведёт к молчаливой неверной конфигурации прода).
3. Условный (P-13): `deploy-production.yml:60-68` -> при включённом `MEMORY_NEO4J_URI` падение `graph:migrate` (Neo4j в OOM-перезапуске, неверный пароль) обрывает деплой несвязанных изменений в полусостоянии -> сделать шаг нефатальным (`|| echo "::error::graph:migrate failed — run manually"`; деплой продолжается), **если владелец не ответит на P-13 иначе**; до ответа — выполнить рекомендованный вариант (b); medium.
4. Скрипты, мелкие и в твоих путях: `scripts/neo4j-backup.sh:17` и `scripts/neo4j-restore.sh:12` `docker compose ps -q` без `-a` -> остановленный контейнер (после неудачного `docker start` в прошлом прогоне) даёт «container not found» при целых данных -> `ps -aq`; `scripts/neo4j-restore.sh:12-13,25-27` `NEO4J_CONTAINER` принимается вслепую для `--overwrite-destination=true` на демоне, где живёт чужой `fc-neo4j` (R-1) -> перед `docker stop` проверить, что у контейнера label `com.docker.compose.service` = `memory-neo4j`, иначе выход с ошибкой; `scripts/neo4j-backup.sh:51` при падении gzip остаётся `*.dump.gz.partial`, не попадающий в ротацию (воспроизведено мутацией M6) -> `rm -f "$OUT.partial"` в `cleanup`; low.

### Не требуется

- Не менять лимиты и имена настроек Neo4j в `docker-compose.yml` (проверены вживую: `SHOW SETTINGS` даёт heap 512/512 MiB, pagecache 256 MiB, transaction.total.max 256 MiB, `-XX:+ExitOnOutOfMemoryError` добавлен к `server.jvm.additional`; `docker inspect` Memory=1610612736).
- Не добавлять `profiles:` (F-8) и `--memory` на одноразовый контейнер (F-7) — backlog, решает владелец.
- Не трогать `ci.yml` (сервис и env верны, run 37656080287 зелёный).
- Не создавать AGENTS.md, не трогать CLAUDE.md (D-17); ADR-013 и `.tl/**` пишет WP-BACKEND-06 (A-4).

## Вопросы владельцу

- P-13 — поведение деплоя при падении `graph:migrate` после включения Neo4j: (a) фатально; (b) нефатально с `::error::` и пунктом владельцу; (c) после pm2. Рекомендация (b); пункт REVISE 3 условный от P-13.
- R-7 — какие `.env` существуют на прод-VM (`/opt/transcrib/.env`, `api/.env`, `worker/.env`); уточняет формулировку README в пункте 2.

## Принято как есть / backlog

- Живая проверка оркестратора (одноразовый клон 278863f, docker, `COMPOSE_PROJECT_NAME=orchinfra`): `docker compose up -d memory-neo4j` → healthy за ~60 с; `docker inspect`: Memory=1610612736, RestartPolicy unless-stopped, порты 127.0.0.1:7475→7474, 127.0.0.1:7688→7687; `SHOW SETTINGS` — все пять значений D-16; `neo4j-backup.sh` → `neo4j-<ts>.dump.gz` (Dump completed successfully), контейнер перезапущен; удаление тестового узла → 0; `neo4j-restore.sh <dump>` → `Restore complete`, узел восстановлен (count 1); две копии в ротации; `docker compose down -v` — чисто. Критерии приёмки 1 и 4 — выполнены (сессия не могла проверить их сама: нет docker-сокета).
- Отклонения PR 1, 3, 4, 5 приняты; отклонение 2 (grep/eval) — не принято как реализовано → пункт 1.
- F-7 одноразовый `docker run` без `--memory`; F-8 без `profiles:` (plain `docker compose up` на dev-машинах стартует и Neo4j — задумано по `.env.example:45`); F-9 CI +33 с на старт сервиса — backlog/информация владельцу.
- `.partial` после сбоя gzip, `ps -q` для остановленного контейнера, слепой `NEO4J_CONTAINER` — вынесены в пункт 4 (дёшево, те же файлы).
- Замечание про `pnpm -r typecheck` в клоне без сборки `shared` — особенность окружения ревью, не PR.
- graph: ADR-013 в графе спецификаций пока нет (read-cypher 2026-10-07: ADR-001..ADR-012); его пишет WP-BACKEND-06 (A-4); строка `graph: checked` будет проставлена точечной правкой при доставке после проверки графа.

## Автоматические находки

- не найдено

Дифф ревизии (пересдачи): —

---

## Отчёт рецензента (дословно)

# Review report — PR #10 (WP-INFRA-01), head `278863f54ef5fc42e53afa49ff84d6aed4e76e78` vs `main @ 343f4a108a`

## 1. Verdict: **REVISE** (one required item, small)

Everything in scope is implemented and the static/dynamic checks pass: all five Neo4j env names map to valid Neo4j 5 settings, `server.jvm.additional` is appended (not replaced) by the image entrypoint so `-XX:+ExitOnOutOfMemoryError` reaches the JVM, compose config resolves both memory caps to 1610612736 without warning, CI is green with the new service (+33 s), and both shell scripts behave correctly under a fake-docker harness including failure paths (container restarted after a failed dump/load, free-space guard fires, rotation keeps 3, restore refuses a missing file). The one item I require fixing now is `deploy-production.yml:63`: `eval "$(grep -E '^MEMORY_NEO4J_' .env)"` executes `.env` content as shell. Dry-run evidence: a password containing a space ran the system command `ss` (701 lines of socket output), `$` and a stray key aborted the deploy with `set -u`/exit 127 after `db:migrate:deploy` and before pm2, and `$(...)`/backticks executed their content. This is the only line of the PR that runs on the production host on every deploy, and the fix is local to `.github/**` (the infra stream's paths — the worker package that will activate the step cannot touch it), so it must be done in this round. Two owner questions (deploy failure mode after activation; which `.env` file on the VM) and the README gaps are listed as P-n / Low.

## 2. Scope -> code -> status (head `278863f5`)

| Item | Where | Status |
|---|---|---|
| 2.1 `memory-neo4j` service, Neo4j 5 Community, 127.0.0.1 ports not clashing with 3614/3627, auth from env, own volume, D-16 limits, `mem_limit`+`deploy.resources`, restart, healthcheck | `docker-compose.yml:74-99`, volume `:105`; resolved by `docker compose config`: `deploy.resources.limits.memory: "1610612736"`, `mem_limit: "1610612736"`, ports `127.0.0.1:7475->7474`, `127.0.0.1:7688->7687`, `restart: unless-stopped`, `memory_neo4j_data:/data`, env `NEO4J_server_memory_heap_initial__size/heap_max__size=512m`, `pagecache_size=256m`, `NEO4J_db_memory_transaction_total_max=256m`, `NEO4J_server_jvm_additional=-XX:+ExitOnOutOfMemoryError` | Done (static; runtime unverifiable here) |
| 2.2 deploy step after `db:migrate:deploy`, `--if-present`, skip with warning when URI unset | `.github/workflows/deploy-production.yml:60-68` | Done; dry-run exit 0 in both skip cases and with URI set + no script. **Finding F-1 on line 63 (eval)** |
| 2.3 CI Neo4j service + env | `.github/workflows/ci.yml:49-61` (service, health options), `:66-69` (env) | Done; run 37656080287 green |
| 2.4 backup script: stop, `neo4j-admin database dump`, gzip, rotation 3, free-space 2×, restart on failure; restore script; README cron/restore | `scripts/neo4j-backup.sh:12,27-32,39-49,51-52,56-59`; `scripts/neo4j-restore.sh:7,9-10,18-19,21-22,24-28`; `scripts/README-neo4j.md:25-53` | Done (shim-verified; real docker unverifiable here) |
| 2.5 `.env.example` `MEMORY_NEO4J_*` | `.env.example:40-48` | Done |
| 2.6 Not doing driver/migrations/prod start | no `graph:migrate` in `worker/package.json:6-14`; no worker/ADR/deploy-plan changes in diff | Respected |
| AC1 `compose up memory-neo4j` healthy with limits (`docker inspect`/`SHOW SETTINGS`) | — | **Unverifiable here (no docker daemon). Static check:** `docker compose config` parses, caps = 1610612736 on both keys, no compose warning on stderr; env names valid per Neo4j 5 entrypoint mapping (`sed 's|_|.|g' | sed 's|\.\.|_|g'`, entrypoint line 606); jvm.additional is in `_append_not_replace_configs` (entrypoint line 273) so JDK `--add-opens` defaults are kept. Not verified: actual container start, `SHOW SETTINGS` values, healthcheck passing. |
| AC2 deploy without URI and without script passes | dry-run of lines 63-68 in the clone | Verified: `::warning::MEMORY_NEO4J_URI is not set - skipping graph:migrate`, exit 0 (no .env; .env without URI); URI set + `pnpm --filter @transcrib/worker run --if-present graph:migrate` → exit 0 |
| AC3 CI green with Neo4j service | run 37656080287, job 112911289662 | Verified: success, 1m34s |
| AC4 backup/restore verified locally | — | **Unverifiable with real Neo4j here. Static + shim check:** scripts run end-to-end against a fake `docker` recording calls (see §6); the `neo4j-admin database dump <db> --to-path=` / `database load <db> --from-path= --overwrite-destination=true` forms are the Neo4j 5 CLI; dump file name `<db>.dump` matches what the scripts read. Not verified: real neo4j-admin exit codes, file ownership inside the volume. |

## 3. Answers to the risk questions

**Q1 Deploy ordering / failure mode.** Heredoc (`.github/workflows/deploy-production.yml:38-82`): `set -euo pipefail` line 39; `git reset --hard origin/main` 47; builds 50-55; `db:migrate:deploy` 58; **new step 60-68** (`.env` eval 63, `if [ -z "${MEMORY_NEO4J_URI:-}" ]` 64, warning 65, `pnpm ... --if-present graph:migrate` 67); rsync 71; `pm2 delete`/`pm2 start`/`pm2 save` 79-81. `set -e` is in effect, so a non-zero `graph:migrate` aborts the ssh script **after** Postgres migrations and **before** rsync and pm2: new code built on disk, new Postgres schema, old processes still running (and the "Notify on failure" rollback text at line 105 does not mention Neo4j). While `MEMORY_NEO4J_URI` is unset this path cannot fail (verified exit 0). Once the owner sets it, any Neo4j outage (OOM restart loop is exactly what D-16 anticipates) or wrong password blocks every deploy of unrelated changes in that partial state. This is the same shape as a `db:migrate:deploy` failure today, but Neo4j is auxiliary and more fragile. Acceptable as implemented for the "optional" phase; the post-activation policy is an owner decision → P-1 (options: keep as is; make the step non-fatal with `::error::` and a follow-up; or move it after pm2 start).

**Q2 grep + eval.** Line 63 exactly: `if [ -f .env ]; then set -a; eval "$(grep -E '^MEMORY_NEO4J_' .env || true)"; set +a; fi`. Dry-run of the exact lines under `set -euo pipefail` in the clone:
- `MEMORY_NEO4J_PASSWORD=pa ss` → bash ran the command `ss` with the var as env (701 lines of socket output); `PASSWORD=[]`, exit 0 → deploy continues with an empty password.
- `MEMORY_NEO4J_PASSWORD=ab$cd9` → `line 4: cd9: unbound variable`, exit 1 → deploy aborts (post-migrate, pre-pm2). Same with `"ab$cd"` quoted.
- `x$(echo INJECTED >&2)y` and backticks → the command executed (`INJECTED` printed), password became `xy`.
- `MEMORY_NEO4J_NOTE` (key without `=`) → `command not found`, exit 127 → deploy aborts.
- `bolt://$NOPE_HOST:7688` → `unbound variable`, abort. CRLF file → values carry `\r`.
- `abc#def` → fine; plain values fine.
dotenv (which pm2 `env_file` and the worker's `import 'dotenv/config'` at `worker/src/config.ts:5` use) treats all of these literally, so the deploy step and the runtime read *different* passwords from the same file. Security-wise this is not a boundary crossing (whoever writes `/opt/transcrib/.env` already has the deploy user's rights), so the risk is robustness: a generated password with `$`, space or backtick breaks or silently mangles the deploy. Safer form (no evaluation, no eval):
```bash
if [ -f .env ]; then
  while IFS= read -r line || [ -n "$line" ]; do
    line="${line%$'\r'}"
    case "$line" in
      MEMORY_NEO4J_URI=*|MEMORY_NEO4J_USER=*|MEMORY_NEO4J_PASSWORD=*|MEMORY_NEO4J_DATABASE=*) export "$line" ;;
    esac
  done < .env
fi
```
(`export "KEY=value"` never executes the value; optionally strip one pair of surrounding quotes to match dotenv.) Simplest alternative: don't export at all — `if grep -qE '^MEMORY_NEO4J_URI=.' .env 2>/dev/null; then pnpm ... graph:migrate; else warning; fi` and let `graph:migrate` load dotenv like the worker does (but see P-2 on which `.env`). REVISE-level: yes, because it is the only prod-executed line in the PR, the fix is one block, and the activating package (worker stream) cannot edit `.github/**`.

**Q3 Neo4j 5 setting names.** Entrypoint (neo4j/docker-neo4j, `5/coredb/docker-entrypoint.sh` line 606): `setting=$(echo "${i}" | sed 's|^NEO4J_||' | sed 's|_|.|g' | sed 's|\.\.|_|g')`. Mapping of `docker-compose.yml:84-88`: `NEO4J_server_memory_heap_initial__size` → `server.memory.heap.initial_size` ✓; `NEO4J_server_memory_heap_max__size` → `server.memory.heap.max_size` ✓; `NEO4J_server_memory_pagecache_size` → `server.memory.pagecache.size` ✓; `NEO4J_db_memory_transaction_total_max` → `db.memory.transaction.total.max` ✓ (valid Neo4j 5 per-database setting, as D-16 specifies); `NEO4J_server_jvm_additional` → `server.jvm.additional` ✓, and this setting is in `_append_not_replace_configs` (entrypoint line 273), so the value is appended to the existing `server.jvm.additional` lines rather than wiping the defaults. No wrong names.

**Q4 compose.** `docker compose config` (v2.37.1) accepted both `mem_limit` and `deploy.resources.limits.memory` with no stderr warning; both resolve to `"1610612736"` (compose-go only errors when the two differ). `docker compose config --services` lists `memory-neo4j minio minio-init postgres redis` — no `profiles:`, so plain `docker compose up` on every dev machine now also starts a 1.5 GB-capped Neo4j. `.env.example:45` points dev at `bolt://localhost:7688`, so dev usage seems intended; the package only required `docker compose up memory-neo4j` to work. Owner's call whether a `profiles: [memory]` entry is preferable (Info). Healthcheck `docker-compose.yml:95`: `cypher-shell -u neo4j -p "$${NEO4J_AUTH#neo4j/}" 'RETURN 1' >/dev/null 2>&1` — `$$` becomes `$` at runtime, `${NEO4J_AUTH#neo4j/}` strips the `neo4j/` prefix of `user/password`, POSIX `sh` compatible; `NEO4J_AUTH` is in the container's configured env so it is visible to the healthcheck process (the entrypoint's `unset` only affects its own shell). It hard-codes user `neo4j`, consistent with line 83. `start_period 30s`, `interval 10s`, `retries 12` → up to 150 s before unhealthy; adequate for a 512m-heap JVM start.

**Q5 Memory arithmetic.** `db.memory.transaction.total.max=256m` bounds transaction memory *inside* the 512m heap, not in addition. Off-heap: pagecache 256m + JVM overhead (metaspace, code cache, threads, Netty direct buffers, Lucene) typically 300-500m → roughly 1.1-1.3 GB steady state under the 1536m cap, leaving headroom; OOM-kill by the kernel is unlikely at normal load for a small graph. `-XX:+ExitOnOutOfMemoryError` reaches the JVM: the entrypoint appends `server.jvm.additional=-XX:+ExitOnOutOfMemoryError` to `neo4j.conf` and `neo4j console --dry-run` (entrypoint line 672-680) emits all `server.jvm.additional` values as JVM args. On a Java OOM the process exits and `restart: unless-stopped` recreates it; on a cgroup OOM the kernel kills it, same restart. Not runtime-verified here (no docker).

**Q6 Backup script** (`scripts/neo4j-backup.sh`). `set -euo pipefail` line 12. Container resolved line 17 via `docker compose ps -q memory-neo4j` (cwd must be the compose project — README cron does `cd /opt/transcrib`). Free-space guard lines 27-32: `docker exec ... du -sk /data | cut -f1` (KB, tab-separated, GNU du in the Debian-based image) vs `df -Pk ... | awk '{print $4}'` (available KB) — units consistent; runs *before* the stop (needs a running container). Dump lines 43-47: `docker stop`, then `docker run --rm --volumes-from "$CONTAINER" -v "$TMP:/backup" "$IMAGE" neo4j-admin database dump "$DB" --to-path=/backup` — correct Community approach (throwaway container on the stopped container's volumes, same image tag as the live container, Neo4j 5 CLI form). The entrypoint runs `neo4j-admin` as uid `neo4j` via `su-exec` (entrypoint line 374, 686), hence the `chmod 777 "$TMP"` on line 36 is needed and correct; TMP lives inside `BACKUP_DIR` (same filesystem as the free-space check). Trap: `trap 'restart; cleanup' EXIT` (line 41) is set before `docker stop`; after a successful dump `restart` runs and the trap is reduced to `cleanup` (48-49), so gzip failure also leaves the container running. Rotation lines 56-59: `ls -1t "$BACKUP_DIR/${DB}"-*.dump.gz | tail -n +"$((KEEP + 1))"` — absolute paths, timestamp names without spaces, `rm -f --`; with `pipefail` the `ls` cannot fail at that point because the new file exists. Shim results (§6): happy path writes `neo4j-<ts>.dump.gz`; with 4 old + 1 new and KEEP=3 removes the two oldest; dump failure → exit 1 and `docker start` still called; data 10^12 KB → guard exits 1 and the container is never stopped; `BACKUP_KEEP=0|abc` rejected. Concrete failure scenarios: (a) gzip fails (disk full) → `.partial` stays and is never rotated (glob is `*.dump.gz`), accumulating on the tight prod disk — Low F-4; (b) container is stopped before the run (e.g. a previous `docker start` failed) → `docker compose ps -q` (no `-a`) returns nothing → "container not found" even though the data is intact — Low F-5; (c) throwaway container has no `--memory` cap; `neo4j-admin`'s JVM sizes itself from the 7.8 GiB host — Info F-7.

**Q7 Restore script** (`scripts/neo4j-restore.sh`). Refuses a missing/absent argument (line 10: `[ -n "$FILE" ] && [ -f "$FILE" ] || usage; exit 1`) — verified exit 1 for both. Gunzips *before* stopping (21-22), so a corrupt archive leaves the container untouched — verified: with a non-gzip file, no `docker stop` was issued. Then `docker stop`, `neo4j-admin database load "$DB" --from-path=/backup --overwrite-destination=true` (26-27, Neo4j 5 form, read-only mount, world-readable temp with `chmod 755/644` for uid 7474), restart via trap (19) — verified restart after a failed load. Wrong-target risk: default resolution is by compose service name in cwd, which is safe; but `NEO4J_CONTAINER` is honoured blindly, and the prod daemon also hosts `fc-neo4j` (R-1) — `NEO4J_CONTAINER=fc-neo4j scripts/neo4j-restore.sh x.gz` would stop and overwrite another project's database. Low F-6 (needs explicit operator error; a label/image guard is cheap).

**Q8 CI.** Service `ci.yml:50-61` has `--health-cmd "cypher-shell -u neo4j -p ci_memory_password 'RETURN 1'"`, interval 10s, timeout 10s, retries 12, start-period 30s → the job waits for health. Env `ci.yml:66-69` uses the contract names `MEMORY_NEO4J_URI/USER/PASSWORD/DATABASE` and the password matches `NEO4J_AUTH` (line 53) and the health-cmd. Run 37656080287: success; job `Lint + Typecheck + Test` 1m34s. Step "Initialize containers" 17:04:02→17:04:48 = **46 s vs 13 s** on pre-PR run 32017387401 (job total 69 s → 93 s): +33 s per CI run, also on each prod deploy's `workflow_call`. Not red; no failing line. Annotations are pre-existing `no-explicit-any` lint warnings in worker tests, unrelated.

**Q9 .env.example / README.** `.env.example:40-48`: four variables, the password variable set to the dev placeholder `memory_dev_password` (equals the compose default, comment says set a real one in prod). README `scripts/README-neo4j.md:11` says "set a real one in prod" but does **not** say *which file* (`/opt/transcrib/.env` — the compose project dir, which is where `${MEMORY_NEO4J_PASSWORD}` interpolation reads it) nor that it must be set **before the first** `docker compose up -d memory-neo4j` — `NEO4J_AUTH` only initialises the password on an empty data volume; set later it is silently ignored and the DB keeps `memory_dev_password` (Low F-3). Cron `README:43-45` → `cd /opt/transcrib && BACKUP_DIR=... scripts/neo4j-backup.sh` matches the script (env-driven, no positional args); restore `README:51-53` `neo4j-<timestamp>.dump.gz` matches `${DB}-${TS}.dump.gz`. `docker inspect` expected value `1610612736` (README:19) matches compose config.

**Q10 Removed behaviour.** `git diff --stat 343f4a108a..278863f5`: 7 files, +209/−0; every hunk contains only `+` lines. Deploy: insertion between line 58 and the rsync comment, same indentation, no existing line moved under the new `if`. Compose: inserted before `volumes:`; `postgres/redis/minio/minio-init` unchanged; `minio-init` still `restart: on-failure`. ci.yml: new service inside `services:`, env appended under the existing job `env:`. No regression.

**Q11 Graph/spec.** PR body explicitly lists ADR-013, `external-contracts/neo4j.md`, `.tl/deploy-plan.md` as not done (WP-BACKEND-06) and claims no graph update; the diff touches no `.tl/**` or graph paths. `graph:` line left to the orchestrator.

## 4. Findings

**F-1 — Medium (REVISE item) — `.github/workflows/deploy-production.yml:63` `eval` of `.env` lines.** Scenario: owner sets `MEMORY_NEO4J_PASSWORD=Ab$9x…` (generated secret) in `/opt/transcrib/.env` → next push to main: `set -u` aborts the ssh script with `unbound variable` after `db:migrate:deploy`, before rsync/pm2 → Postgres migrated, old processes running, every deploy red until diagnosed; a value with a space runs an arbitrary command (`ss` in the dry-run) and continues with an empty password; `$(…)`/backticks execute. Require: parse without evaluation (see Q2 snippet), or only test presence with `grep -q` and let `graph:migrate` load dotenv; strip `\r`.

**F-2 — Medium (question P-1, no code change required by me) — same file, step 60-68 after activation.** Scenario: Neo4j in OOM restart loop at deploy time → `graph:migrate` fails → partial deploy state described in Q1. Owner decides: keep (migrations-before-code, same as Postgres), non-fatal with `::error::`, or after pm2 start. Document the choice in ADR-013/deploy-plan (WP-BACKEND-06).

**F-3 — Low (question P-2 + README) — `scripts/README-neo4j.md:11`, `.env.example:40-43`.** (a) Does not say the prod password must be in `/opt/transcrib/.env` *before the first* `docker compose up -d memory-neo4j` (NEO4J_AUTH is first-start-only). Scenario: owner starts the service with the default, then sets a real password → DB keeps `memory_dev_password`, the app fails auth. (b) Which `.env` on the VM: the deploy step reads `/opt/transcrib/.env` (line 44 `cd /opt/transcrib`, line 63 `.env`), while pm2 uses `env_file: '.env'` relative to `cwd: /opt/transcrib/api|worker` (`ecosystem.config.cjs:8-13,25-30`) and the worker's `dotenv/config` (`worker/src/config.ts:5`) reads its cwd `.env`. If the VM has only `api/.env` and `worker/.env` (no root `.env`), the deploy step warns-and-skips forever even after the owner configures the worker — silent. Require: README states the exact file(s) and the ordering; the deviation list in the PR body does not mention this.

**F-4 — Low — `scripts/neo4j-backup.sh:51`.** On gzip failure `"$OUT.partial"` remains and is excluded from rotation (`:56` glob `*.dump.gz`). Verified by mutation M6: `exit=1`, `neo4j-…dump.gz.partial` left, temp dir cleaned. Suggest `rm -f "$OUT.partial"` in `cleanup`.

**F-5 — Low — `scripts/neo4j-backup.sh:17`, `scripts/neo4j-restore.sh:12`.** `docker compose ps -q` without `-a` lists running containers only; a stopped `memory-neo4j` (e.g. after a failed `docker start` in a previous run) makes both scripts report "container not found". Suggest `docker compose ps -aq memory-neo4j`.

**F-6 — Low — `scripts/neo4j-restore.sh:12-13,25-27`.** `NEO4J_CONTAINER` is trusted blindly for a destructive `--overwrite-destination=true` on a daemon shared with `fc-neo4j` (R-1). Suggest asserting `docker inspect -f '{{index .Config.Labels "com.docker.compose.service"}}'` equals `memory-neo4j` (or the image name contains `neo4j`) before stopping.

**F-7 — Info — `scripts/neo4j-backup.sh:46`, `neo4j-restore.sh:26`.** Throwaway `docker run` has no `--memory` cap; `neo4j-admin`'s JVM sizes from host RAM. Harmless for a small graph; `--memory 1536m` would keep parity with D-16.

**F-8 — Info — `docker-compose.yml:74` without `profiles:`.** Plain `docker compose up` on dev machines now starts the 1.5 GB-capped Neo4j; intended per `.env.example:45`, owner may prefer a profile.

**F-9 — Info — CI.** +33 s per run from the Neo4j service start (13 s → 46 s container init).

No regressions against the base (diff is additive only).

## 5. Deviations from the PR body

1. Criteria 1 and 4 unverified (no docker) — **accepted**; I could not verify them either; static + shim evidence above, remaining gaps stated in §2.
2. Deploy step reads `.env` via grep/eval, which the workflow never did — **declared, but the consequence (F-1) is not acceptable as implemented**; the mechanism must change.
3. `MEMORY_NEO4J_PASSWORD` default `:-` instead of `:?`; healthcheck from `NEO4J_AUTH` — **accepted** (`docker compose config` resolves `neo4j/memory_dev_password`; with `MEMORY_NEO4J_PASSWORD='S3cr#t'` it resolves `neo4j/S3cr#t`). Side effect is F-3(a): the default makes a password-less first start succeed silently.
4. Instructions check exit 1 — **accepted** per D-17; `CLAUDE.md`/`AGENTS.md` not in the diff.
5. GitHub 500s on push — **accepted**, not a code matter.
**Undeclared:** the `/opt/transcrib/.env` vs `api/.env`/`worker/.env` split (F-3b); `.partial` leftovers (F-4); `ps -q` vs stopped container (F-5).

## 6. CI, size, tests, mutations

- CI: run 37656080287 **success** (`gh run view`, `gh pr checks 10`: `Lint + Typecheck + Test pass 1m34s`). First run with the Neo4j service; pre-PR run 32017387401 job 69 s.
- Size: 7 files, +209/−0, all within `docker-compose.yml`, `.github/**`, `scripts/**`, `.env.example`.
- Clone `review_clone.sh --sha 278863f5 --keep` → `/tmp/orch-review.mXJazc`: `pnpm install --frozen-lockfile` exit 0; `db:generate` exit 0; `pnpm -r typecheck` **exit 2 on first run** (TS6305 `shared/dist/index.d.ts has not been built` — the brief's test list lacks `pnpm --filter @transcrib/shared run build`, which CI runs before typecheck; not a PR issue). After `shared` build: `pnpm -r typecheck` exit 0 (shared, api, web, worker Done). `bash -n scripts/neo4j-backup.sh` exit 0; `bash -n scripts/neo4j-restore.sh` exit 0; `docker compose config -q` exit 0 (parse only, no daemon needed; full `config` output used for Q4). `shellcheck`/`actionlint` absent on PATH.
- Deploy dry-run (exact lines 63-68 under `set -euo pipefail`, 12 `.env` variants) — results in Q2.
- Behavioural harness: fake `docker` on PATH recording calls (`compose ps -q`, `inspect`, `exec du`, `stop`, `start`, `run --rm` with simulated dump/load and optional failure). Backup: happy path OK; rotation 4+1 → 3 kept; dump failure → exit 1 with `docker start` issued; free-space guard exit 1 with zero stops; KEEP validation. Restore: missing file → exit 1; happy path stop→load→start; load failure → start still issued; corrupt gz → no stop issued.
- Mutations (on `git show` copies, re-run against the shim): **M1** delete `trap 'restart; cleanup' EXIT` (backup:41) → dump failure leaves container stopped (`STARTED=0`) — detected. **M2** invert `-lt`→`-gt` (backup:29) → guard passes with 10^12 KB data and the container is stopped — detected. **M3** delete restore trap (restore:19) → `STARTED=0` after failed load — detected. **M4** `tail -n +"$((KEEP+1))"`→`+"$KEEP"` (backup:56) → 2 kept instead of 3 — detected. **M6** force gzip failure → `.partial` left (F-4). The PR's own automated checks (`bash -n`, `compose config`) would not catch any of these; the harness above is the evidence.

## 7. Cleanup

`review_clone.sh --cleanup /tmp/orch-review.mXJazc` → `removed /tmp/orch-review.mXJazc`; `ls` confirms the directory is gone. Shim, dry-run and mutation artefacts live only in the session scratchpad; the main checkout `/home/cloudpc/projects/transcriber` and the module worktree were not entered or modified; nothing pushed, no PR comment/approval/merge.

