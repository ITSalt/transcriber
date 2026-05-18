// =============================================================================
// SA Finalization Seed — Transcrib
// Skill: nacl-sa-finalize (full mode)
// Date: 2026-05-18
// Phase: SA → TL (Phase 8 of the 10-phase SA pipeline)
// Validation baseline: VR-SA-003 (0 critical, 0 warning, 4 info)
// =============================================================================
// Idempotent: all writes use MERGE. Safe to re-run.
// Creates:
//   - 5 ADR nodes (ADR-001..ADR-005) as Requirement nodes with type='adr'
//   - 1 FinalizationReport node (FR-SA-001)
//   - Module status → 'finalized' on all 4 modules
//   - HandoffPackage HP-001 status → 'sa_complete'
//   - CONTAINS_ADR edges from FinalizationReport to each ADR
// =============================================================================

// =============================================================================
// SECTION 1 — Architecture Decision Records (ADRs)
// Decisions made during the SA phase that must travel with the spec
// to development agents.
// =============================================================================

// ADR-001: Async pipeline architecture
MERGE (adr001:Requirement {id: 'ADR-001'})
SET adr001.type        = 'adr',
    adr001.title       = 'Async Worker Pipeline for Transcription and Protocol Generation',
    adr001.status      = 'approved',
    adr001.priority    = 'MVP',
    adr001.context     = 'Transcription jobs (BP-002) and protocol generation jobs (BP-004) can take minutes to complete. Blocking the HTTP request-response cycle is not viable for files up to 500 MB. OQ-2 (retry strategy) was resolved in favour of background queue processing.',
    adr001.decision    = 'All long-running jobs (TranscriptionJob, ProtocolGenerationJob) are executed by background workers that consume a persistent queue. The HTTP API accepts the job, returns 202 Accepted, and the worker processes asynchronously. Job status is polled by the client or pushed via SSE/WebSocket.',
    adr001.alternatives = 'Synchronous HTTP with long timeout (rejected: unreliable for 500 MB files on weak connections). Direct webhook from ASR vendor (deferred: Post-MVP).',
    adr001.consequences = 'Introduces queue dependency (e.g., Redis/BullMQ or RabbitMQ). Client must implement status polling (UC-009). Retry logic lives in the worker, not the API controller.',
    adr001.created     = date('2026-05-18'),
    adr001.updated     = date('2026-05-18');

// ADR-002: Speaker name resolution as synchronous UI step (OQ-1 resolved)
MERGE (adr002:Requirement {id: 'ADR-002'})
SET adr002.type        = 'adr',
    adr002.title       = 'Speaker Name Resolution is a Synchronous UI Gate Before Protocol Generation',
    adr002.status      = 'approved',
    adr002.priority    = 'MVP',
    adr002.context     = 'OQ-1: must BP-002-S07B (speaker name resolution) complete before BP-004 (protocol generation) fires, or can they run async? The protocol text quality degrades significantly if speaker labels remain SPEAKER_00/SPEAKER_01.',
    adr002.decision    = 'Speaker name resolution (UC-003) is a mandatory synchronous gate. The system sets TranscriptionJob status to "names-pending" after diarization completes. Protocol generation (UC-004) is not triggered until the user submits the speaker name map and the job transitions to "transcript-ready". The UI presents the speaker mapping form inline in the meeting status page (UC-009).',
    adr002.alternatives = 'Async: generate protocol with SPEAKER_NN labels and allow post-hoc substitution (rejected: produces poor-quality protocol that misleads reviewers). Skip entirely (rejected: breaks BRQ-006 Speaker label completeness rule).',
    adr002.consequences = 'The Meeting lifecycle gains a "names-pending" status state. UC-003 is on the critical path to protocol generation. Meetings with a single detected speaker bypass the gate automatically (system substitutes "Speaker 1" without user prompt).',
    adr002.created     = date('2026-05-18'),
    adr002.updated     = date('2026-05-18');

// ADR-003: Protocol versioning — in-place overwrite with single prior snapshot (OQ-3 resolved)
MERGE (adr003:Requirement {id: 'ADR-003'})
SET adr003.type        = 'adr',
    adr003.title       = 'Protocol Versioning: In-Place Overwrite with One Prior Snapshot',
    adr003.status      = 'approved',
    adr003.priority    = 'MVP',
    adr003.context     = 'OQ-3 (BRQ-011): Protocol versioning model. Append-only immutable log vs. in-place overwrite. The BA rule requires version traceability but the MVP scope is constrained.',
    adr003.decision    = 'MVP implements in-place overwrite with a single "previous_version" snapshot stored on the Protocol entity. Each save replaces the current markdown content and archives the prior version in the previous_content field. Full append-only versioning (version chain) is deferred to Post-MVP as ADR-003-POST.',
    adr003.alternatives = 'Full append-only log (deferred: Post-MVP — adds Protocol_Version entity, VersionChain relationship, complicates PDF export). No versioning at all (rejected: violates BRQ-011).',
    adr003.consequences = 'Protocol domain entity carries both content and previous_content fields. The "revert to previous" action in UC-007 swaps these fields. At most one prior state is accessible at MVP. BRQ-011 is formally met at MVP scope.',
    adr003.created     = date('2026-05-18'),
    adr003.updated     = date('2026-05-18');

// ADR-004: Manual retry for failed jobs via UI button
MERGE (adr004:Requirement {id: 'ADR-004'})
SET adr004.type        = 'adr',
    adr004.title       = 'Failed Job Retry is User-Triggered (Manual Button), Not Auto Back-Off',
    adr004.status      = 'approved',
    adr004.priority    = 'MVP',
    adr004.context     = 'OQ-2: retry strategy for transcription (BP-002-S09) and protocol generation (BP-004-S10) failures. Automatic back-off adds complexity; manual retry is predictable and observable.',
    adr004.decision    = 'At MVP, failed TranscriptionJob and ProtocolGenerationJob expose a "Retry" button in the meeting status view (UC-005 / UC-009). The user clicks Retry, which re-enqueues the job with the same parameters. The worker executes a maximum of 3 attempts per job total (including the original); further retries are blocked and the error message instructs the user to re-upload.',
    adr004.alternatives = 'Automatic exponential back-off (deferred: Post-MVP — adds scheduler complexity and requires dead-letter queue). No retry at all (rejected: poor UX for transient ASR API errors).',
    adr004.consequences = 'UC-005 gains an explicit user action (Retry button). TranscriptionJob and ProtocolGenerationJob entities carry an attempt_count attribute. The 3-attempt cap is enforced by the worker, not the API layer.',
    adr004.created     = date('2026-05-18'),
    adr004.updated     = date('2026-05-18');

// ADR-005: No authentication / multi-tenancy at MVP
MERGE (adr005:Requirement {id: 'ADR-005'})
SET adr005.type        = 'adr',
    adr005.title       = 'No Authentication or Multi-Tenancy at MVP',
    adr005.status      = 'approved',
    adr005.priority    = 'MVP',
    adr005.context     = 'The BA phase explicitly excluded auth/multi-tenancy from MVP scope. The system is intended for single-team internal use. Author and Reviewer are role labels for the UI permission model, not authentication identities.',
    adr005.decision    = 'MVP ships with no login screen, no session management, and no per-user data isolation. The Author and Reviewer system roles (SR-01, SR-02) are enforced by UI routing only — there is no server-side auth middleware. All meetings are visible to all users on the same deployment.',
    adr005.alternatives = 'Simple API key per deployment (deferred: Post-MVP). Full OAuth2 / SSO (out of scope for MVP).',
    adr005.consequences = 'No auth middleware in the backend. SystemRole permissions (HAS_PERMISSION edges) are enforced purely by frontend route guards. Post-MVP auth implementation will require a breaking migration of the role model.',
    adr005.created     = date('2026-05-18'),
    adr005.updated     = date('2026-05-18');

// =============================================================================
// SECTION 2 — Link ADRs to their primary UseCase contexts
// =============================================================================

// ADR-001 applies to: UC-002 (transcription worker), UC-004 (protocol worker), UC-009 (status poll)
MATCH (uc:UseCase) WHERE uc.id IN ['UC-002', 'UC-004', 'UC-009']
MATCH (adr:Requirement {id: 'ADR-001'})
MERGE (uc)-[:HAS_REQUIREMENT]->(adr);

// ADR-002 applies to: UC-003 (speaker resolution), UC-004 (protocol gen gate)
MATCH (uc:UseCase) WHERE uc.id IN ['UC-003', 'UC-004']
MATCH (adr:Requirement {id: 'ADR-002'})
MERGE (uc)-[:HAS_REQUIREMENT]->(adr);

// ADR-003 applies to: UC-007 (protocol edit)
MATCH (uc:UseCase {id: 'UC-007'})
MATCH (adr:Requirement {id: 'ADR-003'})
MERGE (uc)-[:HAS_REQUIREMENT]->(adr);

// ADR-004 applies to: UC-005 (failure handling)
MATCH (uc:UseCase {id: 'UC-005'})
MATCH (adr:Requirement {id: 'ADR-004'})
MERGE (uc)-[:HAS_REQUIREMENT]->(adr);

// =============================================================================
// SECTION 3 — Mark all modules as finalized
// =============================================================================

MATCH (m:Module) WHERE m.id IN ['mod-common', 'mod-ingest', 'mod-transcription', 'mod-protocol']
SET m.status   = 'finalized',
    m.finalized_at = date('2026-05-18');

// =============================================================================
// SECTION 4 — Update HandoffPackage HP-001 to reflect SA completion
// =============================================================================

MERGE (hp:HandoffPackage {id: 'HP-001'})
SET hp.status          = 'sa_complete',
    hp.sa_completed_at = date('2026-05-18'),
    hp.sa_validation   = 'VR-SA-003',
    hp.updated         = date('2026-05-18');

// =============================================================================
// SECTION 5 — FinalizationReport FR-SA-001
// =============================================================================

MERGE (fr:FinalizationReport {id: 'FR-SA-001'})
SET fr.layer                 = 'SA',
    fr.project_id            = 'transcrib',
    fr.status                = 'approved',
    fr.created               = date('2026-05-18'),
    fr.validation_report_ref = 'VR-SA-003',
    fr.validation_summary    = '0 critical, 0 warning, 4 info — PASSED',

    // Specification statistics (from known graph state per prompt context)
    fr.stat_modules          = 4,
    fr.stat_use_cases        = 9,
    fr.stat_use_cases_detailed = 9,
    fr.stat_domain_entities  = 6,
    fr.stat_domain_attributes = 44,
    fr.stat_forms            = 9,
    fr.stat_form_fields      = 45,
    fr.stat_system_roles     = 2,
    fr.stat_requirements     = 12,
    fr.stat_nfrs             = 9,
    fr.stat_components       = 11,
    fr.stat_automates_as_edges = 28,

    // Coverage metrics
    fr.uc_readiness_pct      = 100.0,
    fr.entity_readiness_pct  = 100.0,
    fr.ba_step_coverage_pct  = 100.0,
    fr.ba_entity_coverage_pct = 100.0,
    fr.ba_role_coverage_pct  = 100.0,
    fr.ba_rule_coverage_pct  = 100.0,
    fr.overall_readiness_pct = 100.0,

    // Module readiness breakdown
    fr.module_readiness_json = '[{"module_id":"mod-common","module_name":"Common","total_ucs":2,"detailed_ucs":2,"uc_readiness_pct":100,"total_entities":1,"entities_with_attrs":1,"entity_readiness_pct":100},{"module_id":"mod-ingest","module_name":"Ingestion","total_ucs":3,"detailed_ucs":3,"uc_readiness_pct":100,"total_entities":2,"entities_with_attrs":2,"entity_readiness_pct":100},{"module_id":"mod-transcription","module_name":"Transcription","total_ucs":2,"detailed_ucs":2,"uc_readiness_pct":100,"total_entities":2,"entities_with_attrs":2,"entity_readiness_pct":100},{"module_id":"mod-protocol","module_name":"Protocol","total_ucs":2,"detailed_ucs":2,"uc_readiness_pct":100,"total_entities":1,"entities_with_attrs":1,"entity_readiness_pct":100}]',

    // ADRs created in this finalization pass
    fr.adrs_created          = 'ADR-001,ADR-002,ADR-003,ADR-004,ADR-005',

    // Open questions resolved during SA phase
    fr.open_questions_resolved = 'OQ-1 (speaker resolution sequencing → ADR-002), OQ-2 (retry strategy → ADR-004), OQ-3 (protocol versioning → ADR-003)',
    fr.open_questions_remaining = 'OQ-4 (tech stack TBD — ASR vendor, LLM provider, storage, PDF renderer) — to be resolved at nacl-tl-plan or nacl-sa-architect finalization',

    // Readiness verdict
    fr.tl_handoff_ready      = true,
    fr.next_phase            = 'nacl-tl-plan',
    fr.notes                 = 'All 9 UCs fully detailed. All 6 BA entities realized. All 21 BA rules implemented. 5 ADRs recorded resolving OQ-1, OQ-2, OQ-3. OQ-4 (tech stack) deferred to TL planning. SA specification approved for development handoff.';

// Link FinalizationReport to ADRs
MATCH (fr:FinalizationReport {id: 'FR-SA-001'})
MATCH (adr:Requirement) WHERE adr.id IN ['ADR-001', 'ADR-002', 'ADR-003', 'ADR-004', 'ADR-005']
MERGE (fr)-[:CONTAINS_ADR]->(adr);

// Link FinalizationReport to the HandoffPackage
MATCH (fr:FinalizationReport {id: 'FR-SA-001'})
MATCH (hp:HandoffPackage {id: 'HP-001'})
MERGE (fr)-[:FINALIZES]->(hp);

// =============================================================================
// END OF SEED — FR-SA-001 complete
// Run: execute in Neo4j Browser at bolt://localhost:3587
//      or via: neo4j-mcp write-cypher (contents of this file)
// =============================================================================
