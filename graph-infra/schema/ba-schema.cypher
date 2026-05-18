// BA Layer Schema — 13 node types
// Run once after Neo4j starts to set up constraints and indexes

CREATE CONSTRAINT ba_process_group_id IF NOT EXISTS
FOR (n:ProcessGroup) REQUIRE n.id IS UNIQUE;

CREATE CONSTRAINT ba_business_process_id IF NOT EXISTS
FOR (n:BusinessProcess) REQUIRE n.id IS UNIQUE;

CREATE CONSTRAINT ba_workflow_step_id IF NOT EXISTS
FOR (n:WorkflowStep) REQUIRE n.id IS UNIQUE;

CREATE CONSTRAINT ba_business_entity_id IF NOT EXISTS
FOR (n:BusinessEntity) REQUIRE n.id IS UNIQUE;

CREATE CONSTRAINT ba_entity_attribute_id IF NOT EXISTS
FOR (n:EntityAttribute) REQUIRE n.id IS UNIQUE;

CREATE CONSTRAINT ba_entity_state_id IF NOT EXISTS
FOR (n:EntityState) REQUIRE n.id IS UNIQUE;

CREATE CONSTRAINT ba_business_role_id IF NOT EXISTS
FOR (n:BusinessRole) REQUIRE n.id IS UNIQUE;

CREATE CONSTRAINT ba_business_rule_id IF NOT EXISTS
FOR (n:BusinessRule) REQUIRE n.id IS UNIQUE;

CREATE CONSTRAINT ba_glossary_term_id IF NOT EXISTS
FOR (n:GlossaryTerm) REQUIRE n.id IS UNIQUE;

CREATE CONSTRAINT ba_system_context_id IF NOT EXISTS
FOR (n:SystemContext) REQUIRE n.id IS UNIQUE;

CREATE CONSTRAINT ba_stakeholder_id IF NOT EXISTS
FOR (n:Stakeholder) REQUIRE n.id IS UNIQUE;

CREATE CONSTRAINT ba_external_entity_id IF NOT EXISTS
FOR (n:ExternalEntity) REQUIRE n.id IS UNIQUE;

CREATE CONSTRAINT ba_data_flow_id IF NOT EXISTS
FOR (n:DataFlow) REQUIRE n.id IS UNIQUE;
