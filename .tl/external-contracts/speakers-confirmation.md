# Contract — speakers-confirmation v1

Подтверждение спикеров перед генерацией протокола (FR-004, D-38). Автор контракта — WP-BACKEND-07.
Потребители: **WP-WORKER-06** (ставит статус, читает карту), **WP-FRONTEND-06** (экран подтверждения).
Схемы Zod — `shared/src/api/speakers.ts` (`SpeakersResponse`, `SpeakersPutRequest`, `SpeakersPutResponse`).
Читать код api не нужно.

## 1. Identity

| Field | Value |
|---|---|
| Name | `speakers-confirmation` |
| Kind | protocol (внутренний, api ↔ worker ↔ web) |
| Status | `AWAITING_SPEAKERS` в `MeetingStatus` (Prisma enum + `shared/src/enums.ts`) |
| Migration | `api/prisma/migrations/20261009120000_awaiting_speakers` (+ `down.sql`) |

## 2. Статус `AWAITING_SPEAKERS`

Семантика: речь распознана, ждём подтверждения спикеров автором. Ставит **только воркер**
(WP-WORKER-06) вместо `TRANSCRIBED` + создания `ProtocolGenerationJob`, и **только** для встреч, запущенных
с контекстом (`meeting_contexts.snapshot_hash IS NOT NULL`). Остальные идут по старому потоку
(`TRANSCRIBED` → `GENERATING_PROTOCOL`). Воркер в этом статусе **не создаёт** задание генерации — его
создаёт api при подтверждении. Выход из статуса — только `PUT /speakers`.

Поток статусов: `TRANSCRIBING → AWAITING_SPEAKERS → GENERATING_PROTOCOL → PROTOCOL_READY | FAILED`.
SSE `meeting.status` (`GET /api/meetings/:id/events`) несёт новый статус как обычный; api публикует
`GENERATING_PROTOCOL` после подтверждения, воркер — `AWAITING_SPEAKERS` при переходе.
Встречи, которые на момент деплоя уже в `TRANSCRIBED`, не затрагиваются.

## 3. Маршруты

Оба — под `/api/meetings/:id`, доступ как у остальных маршрутов встречи (чужая или несуществующая → `404 NOT_FOUND`).

### GET `/api/meetings/:id/speakers` → `SpeakersResponse`

Доступен в `AWAITING_SPEAKERS` и позже (`GENERATING_PROTOCOL`, `PROTOCOL_READY`, `EDITED`, а также
`TRANSCRIBED`/`FAILED`, если транскрипт уже есть). До распознавания (`CREATED`…`TRANSCRIBING`) или без транскрипта —
`409 MEETING_NOT_AWAITING_SPEAKERS`.

```jsonc
{
  "meeting_id": "uuid",
  "status": "AWAITING_SPEAKERS",
  "project_id": "uuid | null",
  "participants": [{ "id": "uuid", "name": "Анна", "role": "PM | null", "organization": "ACME | null" }],
  "labels": [{
    "label": "SPEAKER_0",          // метка диаризации из segments_blob, порядок по номеру
    "display": "Speaker 1",        // нейтральное имя из промпта (N = номер метки + 1)
    "duration_sec": 65,            // суммарная длительность реплик
    "segment_count": 5,
    "samples": [{ "start_ms": 45000, "text": "…≤200 знаков" }], // 3 самые длинные реплики, по времени
    "name": "Анна | null",         // текущее значение speaker_map (предзаполнение воркера или подтверждение)
    "participant_id": "uuid | null" // участник, выбранный при подтверждении (иначе null)
  }],
  "confirmed_at": "ISO | null"
}
```

`participants` — участники проекта встречи (пусто, если проекта нет).

### PUT `/api/meetings/:id/speakers` → `{ meeting_id, status: "GENERATING_PROTOCOL" }`

```jsonc
{ "action": "confirm" | "skip",
  "mapping": [{ "label": "SPEAKER_0", "participant_id": "uuid | null", "name": "string | null" }] }
```

- Только в `AWAITING_SPEAKERS`; иначе и при повторе — `409 MEETING_NOT_AWAITING_SPEAKERS`.
  Две одновременные отправки: одна получает 200, вторая 409; задание создаётся одно.
- `confirm`: для каждой записи имя = `name` выбранного участника проекта (`participant_id`), иначе `name`
  (обрезается; свободное имя), иначе пустая запись = `null` («Speaker N»). **Объединение**: несколько меток могут указывать на одного
  участника — все получают одно имя. Метки, которых нет в `mapping`, сохраняют текущее значение.
- `skip`: имена не меняются, `mapping` игнорируется; всё остальное то же самое.
- Ошибки: `404 NOT_FOUND` — `participant_id` не из проекта встречи (или у встречи нет проекта); `400 UNKNOWN_SPEAKER_LABEL` —
  метки нет в записи или она повторяется; `400` — тело не прошло схему.
- Одной транзакцией: `transcripts.speaker_map`, `transcripts.speaker_mapping`, `transcripts.speakers_confirmed_at`,
  статус встречи `AWAITING_SPEAKERS → GENERATING_PROTOCOL`, `ProtocolGenerationJob` (создаётся или сбрасывается в `PENDING`).
  После фиксации: постановка в очередь `protocolGenerationJob` (payload `{ protocol_generation_job_id }`) и SSE.
  Сбой постановки не отменяет подтверждение (задание `PENDING` остаётся в БД, как в uc-004).

## 4. Кто пишет и читает `transcripts.speaker_map`

| Кто | Когда | Что |
|---|---|---|
| worker (транскрипция) | после распознавания | предзаполнение `{ "SPEAKER_n": "Имя" \| null }` по самопредставлению (`resolveSpeakers`), `raw_text`, `segments_blob` |
| api (`PUT /speakers`) | подтверждение | перезаписывает `speaker_map`; сырой запрос — в `speaker_mapping` (`{ action, mapping: [{ label, participant_id, name }] }`); время — `speakers_confirmed_at` |
| worker (генерация протокола) | старт задания | читает `speaker_map` и `segments_blob` |

**Важно для worker:** api **не переписывает** `transcripts.raw_text` — в нём остаются имена предзаполнения.
При генерации воркер строит текст реплик заново из `segments_blob` + `speaker_map` (`[MM:SS] Имя|Speaker N: текст`,
как `buildFullText`), если `speakers_confirmed_at IS NOT NULL`. `speaker_map` не содержит дублей смысла: при слиянии
несколько меток имеют одно имя — воркер подставляет его как есть. Повтор генерации после `FAILED`
(`POST /api/meetings/:id/retry`) использует сохранённую карту.

## 5. Ограничение: объединять можно, разделять нельзя

Подтверждение лечит пересегментацию (один человек — две метки: обе метки получают одно имя). Недосегментацию
(двое говорящих под одной меткой) без повторной диаризации исправить нельзя; число спикеров до диаризации
Deepgram не принимает (D-21), диаризация вариативна между запусками.

## 6. Миграция и откат

Одна миграция: `ADD VALUE 'AWAITING_SPEAKERS'`, `transcripts.speaker_mapping JSONB NULL`,
`transcripts.speakers_confirmed_at TIMESTAMP NULL`. Значение enum в Postgres необратимо: `down.sql` пересоздаёт
`MeetingStatus` без него и **отказывается** работать (ничего не меняя), пока есть встречи в `AWAITING_SPEAKERS`.
Значения новых колонок при откате теряются (`speaker_map` сохраняется). Runbook — `.tl/deploy-plan.md` §5.
