# Restore Neo4j Graph — Agent Instructions

Это инструкция для Claude Code, запущенного в свежеклонированном репозитории на новой машине. Цель: восстановить граф проекта (BA + SA + TL спецификации) из дампа в git, чтобы `nacl-*` скиллы заработали.

**Контекст:**
- Граф = source of truth (см. `CLAUDE.md`, секция «Documentation Rules»).
- Дамп лежит в `graph-infra/exports/transcrib-graph-export.cypher` (APOC `cypher-shell` формат).
- Снимок сделан **2026-05-21**: 477 узлов, 881 связь, 3 903 свойства.
- Конфиг подключения уже в `.mcp.json` и `graph-infra/.env` — менять не нужно.
- `.env` для приложения **не нужен** (приложение крутится на проде, локально его не запускаем).

---

## Шаги

Выполни последовательно. Если шаг падает — остановись, покажи ошибку, не пытайся «починить» граф вручную.

### 1. Проверь предусловия

```bash
docker version
docker compose version
```

Если Docker не установлен — сообщи пользователю и остановись.

Проверь, что порты `3574` и `3587` свободны:
```bash
docker ps --format '{{.Names}}\t{{.Ports}}' | grep -E '3574|3587' || echo "ports free"
```

Если уже есть контейнер `transcrib-neo4j` — спроси пользователя, можно ли его пересоздать (внутри может быть устаревший граф).

### 2. Подними Neo4j

```bash
cd graph-infra
docker compose --env-file .env up -d --wait
cd ..
```

Дождись `healthy`:
```bash
docker ps --filter name=transcrib-neo4j --format '{{.Status}}'
```

### 3. Восстанови граф

```bash
docker cp graph-infra/exports/transcrib-graph-export.cypher \
  transcrib-neo4j:/var/lib/neo4j/import/restore.cypher

docker exec -i transcrib-neo4j cypher-shell -u neo4j -p neo4j_graph_dev \
  --file /var/lib/neo4j/import/restore.cypher
```

Ожидай в выводе: `0 rows`, многократные `Added N constraints`, `Created N nodes`, `Created N relationships`. Ошибки про существующие constraints в **пустом** графе быть не должно. Если граф уже был непуст и команда упала — это нормально: запусти сначала очистку (см. секцию «Если граф не пуст» ниже), затем повтори импорт.

### 4. Проверь результат

```bash
docker exec transcrib-neo4j cypher-shell -u neo4j -p neo4j_graph_dev \
  "MATCH (n) RETURN count(n) AS nodes;"
# Ожидается: 477

docker exec transcrib-neo4j cypher-shell -u neo4j -p neo4j_graph_dev \
  "MATCH ()-[r]->() RETURN count(r) AS rels;"
# Ожидается: 881
```

Если числа не совпадают — это критично. Покажи пользователю фактические значения и спроси, что делать (повторить импорт / пересоздать контейнер / сделать новый дамп со старой машины).

### 5. Smoke-тест графа через MCP

После восстановления MCP-сервер `neo4j` (см. `.mcp.json`) уже знает, как ходить в Bolt. Выполни одну read-only Cypher через `mcp__neo4j__read-cypher`:

```cypher
MATCH (uc:UseCase) RETURN count(uc) AS use_cases
```

Если возвращается число > 0 — граф восстановлен и доступен скиллам.

### 6. Финальный отчёт пользователю

Сообщи коротко:
- ✅ Neo4j поднят на `bolt://localhost:3587` / Browser `http://localhost:3574`
- ✅ Граф восстановлен: N узлов / M связей (фактические числа из шага 4)
- Следующий шаг для пользователя: `/nacl-tl-status` или `/nacl-tl-next` — должны работать поверх восстановленного графа.

---

## Если граф не пуст

Если шаг 3 падает с `Constraint already exists` или Neo4j не свежий, очисти и повтори:

```bash
docker exec transcrib-neo4j cypher-shell -u neo4j -p neo4j_graph_dev \
  "MATCH (n) DETACH DELETE n;"

# Сбрось constraints
docker exec transcrib-neo4j cypher-shell -u neo4j -p neo4j_graph_dev \
  "SHOW CONSTRAINTS YIELD name" | tail -n +2 | while read name; do
    docker exec transcrib-neo4j cypher-shell -u neo4j -p neo4j_graph_dev \
      "DROP CONSTRAINT \`$name\`;"
  done
```

Затем повтори шаг 3.

---

## Если нужно сделать свежий дамп (для будущих переносов)

Запустить **на старой машине** в исходном проекте, затем закоммитить результат:

```bash
docker exec transcrib-neo4j cypher-shell -u neo4j -p neo4j_graph_dev \
  "CALL apoc.export.cypher.all('transcrib-graph-export.cypher', \
   {format:'cypher-shell', useOptimizations:{type:'UNWIND_BATCH', unwindBatchSize:20}});"

docker cp transcrib-neo4j:/var/lib/neo4j/import/transcrib-graph-export.cypher \
  graph-infra/exports/transcrib-graph-export.cypher

git add graph-infra/exports/transcrib-graph-export.cypher
git commit -m "chore(graph): refresh graph snapshot"
git push
```
