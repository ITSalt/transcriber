// BA → SA Handoff Queries
// Used by nacl-ba-handoff and nacl-sa-architect skills

// handoff_ba_to_sa — BA artifacts ready for SA import
// MATCH (gpr:ProcessGroup)
// OPTIONAL MATCH (gpr)-[:CONTAINS_PROCESS]->(bp:BusinessProcess)
// OPTIONAL MATCH (bp)-[:HAS_STEP]->(step:WorkflowStep)
// OPTIONAL MATCH (step)-[:PERFORMED_BY]->(role:BusinessRole)
// OPTIONAL MATCH (step)-[:USES_ENTITY]->(entity:BusinessEntity)
// RETURN gpr, collect(DISTINCT bp) AS processes,
//        collect(DISTINCT role) AS roles,
//        collect(DISTINCT entity) AS entities
// ORDER BY gpr.id

// handoff_suggests — BA → SA suggestion edges
// MATCH (gpr:ProcessGroup)-[:SUGGESTS]->(m:Module)
// RETURN gpr.id AS processGroup, m.id AS module, m.name AS moduleName

// handoff_coverage — which BA entities are covered by SA domain entities
// MATCH (ba_entity:BusinessEntity)
// OPTIONAL MATCH (ba_entity)-[:MAPPED_TO]->(sa_entity:DomainEntity)
// RETURN ba_entity.id AS baEntity, ba_entity.name AS baName,
//        sa_entity.id AS saEntity, sa_entity.name AS saName,
//        (sa_entity IS NULL) AS isMissing
// ORDER BY ba_entity.id

// handoff_role_coverage — BA roles vs SA system roles
// MATCH (ba_role:BusinessRole)
// OPTIONAL MATCH (ba_role)-[:MAPPED_TO]->(sa_role:SystemRole)
// RETURN ba_role.id AS baRole, ba_role.name AS baName,
//        sa_role.id AS saRole, sa_role.name AS saName,
//        (sa_role IS NULL) AS isMissing
// ORDER BY ba_role.id
