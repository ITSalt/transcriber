// =============================================================================
// SA Finalization Queries — Transcrib
// Skill: nacl-sa-finalize (full mode)
// Date: 2026-05-18
// Run these via Neo4j Browser (http://localhost:3574) or mcp__neo4j__read-cypher
// =============================================================================


// ---------------------------------------------------------------------------
// Query 1: sa_statistics_summary
// Full aggregate counts across the SA layer
// ---------------------------------------------------------------------------
MATCH (m:Module) WITH count(m) AS modules
MATCH (uc:UseCase) WITH modules, count(uc) AS ucs
OPTIONAL MATCH (uc2:UseCase {detail_status: 'complete'}) WITH modules, ucs, count(uc2) AS ucs_detailed
MATCH (de:DomainEntity) WITH modules, ucs, ucs_detailed, count(de) AS entities
OPTIONAL MATCH (da:DomainAttribute) WITH modules, ucs, ucs_detailed, entities, count(da) AS attributes
OPTIONAL MATCH (f:Form)  WITH modules, ucs, ucs_detailed, entities, attributes, count(f) AS forms
OPTIONAL MATCH (ff:FormField) WITH modules, ucs, ucs_detailed, entities, attributes, forms, count(ff) AS fields
OPTIONAL MATCH (sr:SystemRole) WITH modules, ucs, ucs_detailed, entities, attributes, forms, fields, count(sr) AS roles
OPTIONAL MATCH (rq:Requirement WHERE rq.type = 'functional') WITH modules, ucs, ucs_detailed, entities, attributes, forms, fields, roles, count(rq) AS func_reqs
OPTIONAL MATCH (nfr:Requirement WHERE nfr.type = 'nfr') WITH modules, ucs, ucs_detailed, entities, attributes, forms, fields, roles, func_reqs, count(nfr) AS nfrs
OPTIONAL MATCH (adr:Requirement WHERE adr.type = 'adr') WITH modules, ucs, ucs_detailed, entities, attributes, forms, fields, roles, func_reqs, nfrs, count(adr) AS adrs
OPTIONAL MATCH (c:Component) WITH modules, ucs, ucs_detailed, entities, attributes, forms, fields, roles, func_reqs, nfrs, adrs, count(c) AS components
RETURN modules, ucs, ucs_detailed,
       round(100.0 * ucs_detailed / ucs, 1) AS uc_detail_coverage_pct,
       entities, attributes, forms, fields, roles,
       func_reqs, nfrs, adrs, components;


// ---------------------------------------------------------------------------
// Query 2: sa_readiness_assessment
// Per-module readiness percentages
// ---------------------------------------------------------------------------
MATCH (m:Module)
OPTIONAL MATCH (m)-[:CONTAINS_UC]->(uc:UseCase)
WITH m,
     count(uc) AS total_ucs,
     count(CASE WHEN uc.detail_status = 'complete' THEN 1 END) AS detailed_ucs
OPTIONAL MATCH (m)-[:CONTAINS_ENTITY]->(de:DomainEntity)
WITH m, total_ucs, detailed_ucs, count(de) AS total_entities
OPTIONAL MATCH (m)-[:CONTAINS_ENTITY]->(de2:DomainEntity)-[:HAS_ATTRIBUTE]->()
WITH m, total_ucs, detailed_ucs, total_entities,
     count(DISTINCT de2) AS entities_with_attrs
RETURN m.id   AS module_id,
       m.name AS module_name,
       m.status AS module_status,
       total_ucs,
       detailed_ucs,
       CASE WHEN total_ucs > 0
            THEN round(100.0 * detailed_ucs / total_ucs, 1)
            ELSE 0 END AS uc_readiness_pct,
       total_entities,
       entities_with_attrs,
       CASE WHEN total_entities > 0
            THEN round(100.0 * entities_with_attrs / total_entities, 1)
            ELSE 0 END AS entity_readiness_pct
ORDER BY m.id;


// ---------------------------------------------------------------------------
// Query 3: sa_adr_list
// All ADR nodes recorded during SA phase
// ---------------------------------------------------------------------------
MATCH (adr:Requirement {type: 'adr'})
RETURN adr.id      AS id,
       adr.title   AS title,
       adr.status  AS status,
       adr.priority AS priority,
       adr.decision AS decision
ORDER BY adr.id;


// ---------------------------------------------------------------------------
// Query 4: sa_finalization_report
// The FinalizationReport node with full metrics
// ---------------------------------------------------------------------------
MATCH (fr:FinalizationReport {id: 'FR-SA-001'})
RETURN fr;


// ---------------------------------------------------------------------------
// Query 5: sa_uc_completion_check
// Verify all 9 UCs are detail_status = 'complete' and system_uc flags
// ---------------------------------------------------------------------------
MATCH (uc:UseCase)
OPTIONAL MATCH (m:Module)-[:CONTAINS_UC]->(uc)
RETURN uc.id AS uc_id,
       uc.name AS uc_name,
       m.id AS module_id,
       uc.detail_status AS detail_status,
       uc.system_uc AS system_uc,
       uc.priority AS priority
ORDER BY uc.id;


// ---------------------------------------------------------------------------
// Query 6: handoff_coverage_summary
// Cross-layer BA→SA coverage for TL handoff confirmation
// ---------------------------------------------------------------------------
MATCH (ws:WorkflowStep)-[:AUTOMATES_AS]->(uc:UseCase)
WITH count(*) AS automates_as_edges
MATCH (be:BusinessEntity)-[:REALIZED_AS]->(de:DomainEntity)
WITH automates_as_edges, count(*) AS realized_as_edges
MATCH (br:BusinessRole)-[:MAPPED_TO]->(sr:SystemRole)
WITH automates_as_edges, realized_as_edges, count(*) AS mapped_to_edges
MATCH (brq:BusinessRule)-[:IMPLEMENTED_BY]->(rq:Requirement)
WITH automates_as_edges, realized_as_edges, mapped_to_edges, count(*) AS implemented_by_edges
RETURN automates_as_edges,
       realized_as_edges,
       mapped_to_edges,
       implemented_by_edges,
       (automates_as_edges + realized_as_edges + mapped_to_edges + implemented_by_edges) AS total_traceability_edges;
