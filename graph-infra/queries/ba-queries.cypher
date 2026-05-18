// BA Named Queries Library
// Used by nacl-ba-* skills via mcp__neo4j__read-cypher

// ba_system_context — full system context with all relations
// MATCH (sc:SystemContext)
// OPTIONAL MATCH (sc)-[:HAS_STAKEHOLDER]->(stk:Stakeholder)
// OPTIONAL MATCH (sc)-[:HAS_EXTERNAL_ENTITY]->(ext:ExternalEntity)
// OPTIONAL MATCH (ext)-[flow:HAS_FLOW]->(sc)
// RETURN sc, collect(DISTINCT stk) AS stakeholders,
//        collect(DISTINCT ext) AS external_entities,
//        collect(DISTINCT {entity: ext.name, direction: flow.direction, data: flow.data_description}) AS data_flows

// ba_process_map — all process groups and their processes
// MATCH (gpr:ProcessGroup)
// OPTIONAL MATCH (gpr)-[:CONTAINS_PROCESS]->(bp:BusinessProcess)
// RETURN gpr, collect(bp) AS processes ORDER BY gpr.id

// ba_workflow — all steps for a given business process
// MATCH (bp:BusinessProcess {id: $processId})-[:HAS_STEP]->(ws:WorkflowStep)
// OPTIONAL MATCH (ws)-[:PERFORMED_BY]->(role:BusinessRole)
// OPTIONAL MATCH (ws)-[:USES_ENTITY]->(entity:BusinessEntity)
// RETURN bp, ws, role, entity ORDER BY ws.sequence

// ba_entity_catalog — all entities with attributes and states
// MATCH (e:BusinessEntity)
// OPTIONAL MATCH (e)-[:HAS_ATTRIBUTE]->(attr:EntityAttribute)
// OPTIONAL MATCH (e)-[:HAS_STATE]->(state:EntityState)
// RETURN e, collect(DISTINCT attr) AS attributes, collect(DISTINCT state) AS states ORDER BY e.id

// ba_role_matrix — roles and their process participation
// MATCH (role:BusinessRole)
// OPTIONAL MATCH (role)<-[:PERFORMED_BY]-(step:WorkflowStep)<-[:HAS_STEP]-(bp:BusinessProcess)
// RETURN role, collect(DISTINCT {process: bp.id, step: step.id}) AS activities ORDER BY role.id

// ba_rules_catalog — all business rules
// MATCH (rule:BusinessRule)
// OPTIONAL MATCH (rule)-[:APPLIES_TO]->(entity:BusinessEntity)
// OPTIONAL MATCH (rule)-[:GOVERNS]->(step:WorkflowStep)
// RETURN rule, collect(DISTINCT entity) AS entities, collect(DISTINCT step) AS steps ORDER BY rule.id

// ba_glossary — all terms
// MATCH (term:GlossaryTerm)
// RETURN term ORDER BY term.name
