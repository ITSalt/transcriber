// Validation Queries — used by nacl-ba-validate and nacl-sa-validate

// === BA VALIDATION (L1-L8) ===

// L1: ProcessGroups without any processes
// MATCH (gpr:ProcessGroup)
// WHERE NOT (gpr)-[:CONTAINS_PROCESS]->(:BusinessProcess)
// RETURN gpr.id, gpr.name AS issue

// L2: BusinessProcesses without workflow steps
// MATCH (bp:BusinessProcess)
// WHERE NOT (bp)-[:HAS_STEP]->(:WorkflowStep)
// RETURN bp.id, bp.name AS issue

// L3: WorkflowSteps without performer role
// MATCH (step:WorkflowStep)
// WHERE NOT (step)-[:PERFORMED_BY]->(:BusinessRole)
// RETURN step.id, step.name AS issue

// L4: BusinessEntities without attributes
// MATCH (entity:BusinessEntity)
// WHERE NOT (entity)-[:HAS_ATTRIBUTE]->(:EntityAttribute)
// RETURN entity.id, entity.name AS issue

// L5: BusinessRules without scope (entity or step reference)
// MATCH (rule:BusinessRule)
// WHERE NOT (rule)-[:APPLIES_TO]->(:BusinessEntity)
//   AND NOT (rule)-[:GOVERNS]->(:WorkflowStep)
// RETURN rule.id, rule.description AS issue

// L6: GlossaryTerms without definition
// MATCH (term:GlossaryTerm)
// WHERE term.definition IS NULL OR term.definition = ''
// RETURN term.id, term.name AS issue

// L7: WorkflowSteps referencing undefined entities
// MATCH (step:WorkflowStep)-[:USES_ENTITY]->(entity:BusinessEntity)
// WHERE entity.name IS NULL
// RETURN step.id, entity.id AS issue

// L8: Orphaned DataFlows (no source or target)
// MATCH (flow:DataFlow)
// WHERE NOT ()-[:HAS_FLOW]->(flow) AND NOT (flow)-[:HAS_FLOW]->()
// RETURN flow.id AS issue

// === SA VALIDATION (L1-L6) ===

// L1: Modules without use cases
// MATCH (m:Module)
// WHERE NOT (m)-[:CONTAINS_UC]->(:UseCase)
// RETURN m.id, m.name AS issue

// L2: UseCases without forms
// MATCH (uc:UseCase)
// WHERE NOT (uc)-[:HAS_FORM]->(:Form)
// RETURN uc.id, uc.name AS issue

// L3: UseCases without requirements
// MATCH (uc:UseCase)
// WHERE NOT (uc)-[:HAS_REQUIREMENT]->(:Requirement)
// RETURN uc.id, uc.name AS issue

// L4: Forms without fields
// MATCH (form:Form)
// WHERE NOT (form)-[:HAS_FIELD]->(:Field)
// RETURN form.id, form.name AS issue

// L5: DomainEntities without attributes
// MATCH (entity:DomainEntity)
// WHERE NOT (entity)-[:HAS_ATTRIBUTE]->(:DomainEntityAttribute)
// RETURN entity.id, entity.name AS issue

// L6: SystemRoles without permissions
// MATCH (role:SystemRole)
// WHERE NOT (role)-[:HAS_PERMISSION]->(:UseCase)
// RETURN role.id, role.name AS issue

// === CROSS-VALIDATION (XL6-XL9 BA→SA) ===

// XL6: BA BusinessProcesses not covered by any SA UseCase
// MATCH (bp:BusinessProcess)
// WHERE NOT (bp)-[:COVERED_BY]->(:UseCase)
// RETURN bp.id, bp.name AS issue

// XL7: BA BusinessEntities not mapped to SA DomainEntity
// MATCH (entity:BusinessEntity)
// WHERE NOT (entity)-[:MAPPED_TO]->(:DomainEntity)
// RETURN entity.id, entity.name AS issue

// XL8: BA BusinessRoles not mapped to SA SystemRole
// MATCH (role:BusinessRole)
// WHERE NOT (role)-[:MAPPED_TO]->(:SystemRole)
// RETURN role.id, role.name AS issue

// XL9: BA BusinessRules not referenced in SA requirements
// MATCH (rule:BusinessRule)
// WHERE NOT (rule)-[:REFERENCED_IN]->(:Requirement)
// RETURN rule.id, rule.description AS issue
