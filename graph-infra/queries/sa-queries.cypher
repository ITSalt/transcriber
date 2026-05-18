// SA Named Queries Library
// Used by nacl-sa-* skills via mcp__neo4j__read-cypher

// sa_modules — all modules with dependency map
// MATCH (m:Module)
// OPTIONAL MATCH (m)-[dep:DEPENDS_ON]->(other:Module)
// RETURN m, collect({module: other.id, type: dep.type, description: dep.description}) AS dependencies
// ORDER BY m.id

// sa_module_full — full context for one module
// MATCH (m:Module {id: $moduleId})
// OPTIONAL MATCH (m)-[:CONTAINS_UC]->(uc:UseCase)
// OPTIONAL MATCH (m)-[:CONTAINS_ENTITY]->(entity:DomainEntity)
// OPTIONAL MATCH (m)-[:DEPENDS_ON]->(dep:Module)
// RETURN m,
//        collect(DISTINCT uc) AS use_cases,
//        collect(DISTINCT entity) AS entities,
//        collect(DISTINCT dep.id) AS dependencies

// sa_uc_registry — all use cases with module and priority
// MATCH (uc:UseCase)
// OPTIONAL MATCH (m:Module)-[:CONTAINS_UC]->(uc)
// RETURN uc, m.id AS module ORDER BY uc.id

// sa_uc_full_context — everything needed to implement a UC
// MATCH (uc:UseCase {id: $ucId})
// OPTIONAL MATCH (m:Module)-[:CONTAINS_UC]->(uc)
// OPTIONAL MATCH (uc)-[:HAS_FORM]->(form:Form)
// OPTIONAL MATCH (form)-[:HAS_FIELD]->(field:Field)
// OPTIONAL MATCH (uc)-[:HAS_REQUIREMENT]->(req:Requirement)
// OPTIONAL MATCH (uc)-[:USES_ENTITY]->(entity:DomainEntity)
// OPTIONAL MATCH (uc)-[:PERFORMED_BY]->(role:SystemRole)
// RETURN uc, m,
//        collect(DISTINCT form) AS forms,
//        collect(DISTINCT field) AS fields,
//        collect(DISTINCT req) AS requirements,
//        collect(DISTINCT entity) AS entities,
//        collect(DISTINCT role) AS roles

// sa_domain_entities — all domain entities with attributes and states
// MATCH (entity:DomainEntity)
// OPTIONAL MATCH (entity)-[:HAS_ATTRIBUTE]->(attr:DomainEntityAttribute)
// OPTIONAL MATCH (entity)-[:HAS_STATE]->(state:DomainEntityState)
// OPTIONAL MATCH (m:Module)-[:CONTAINS_ENTITY]->(entity)
// RETURN entity, m.id AS module,
//        collect(DISTINCT attr) AS attributes,
//        collect(DISTINCT state) AS states
// ORDER BY entity.id

// sa_role_permissions — roles with their permissions
// MATCH (role:SystemRole)
// OPTIONAL MATCH (role)-[perm:HAS_PERMISSION]->(uc:UseCase)
// RETURN role, collect({useCase: uc.id, type: perm.type}) AS permissions ORDER BY role.id

// sa_ui_screens — screens with navigation
// MATCH (screen:Screen)
// OPTIONAL MATCH (screen)-[:NAVIGATES_TO]->(target:Screen)
// OPTIONAL MATCH (screen)-[:CONTAINS]->(comp:UIComponent)
// RETURN screen, collect(DISTINCT target.id) AS navigates_to,
//        collect(DISTINCT comp) AS components
// ORDER BY screen.id
