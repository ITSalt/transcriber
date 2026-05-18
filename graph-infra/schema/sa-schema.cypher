// SA Layer Schema — 12 node types
// Run after ba-schema.cypher

CREATE CONSTRAINT sa_module_id IF NOT EXISTS
FOR (n:Module) REQUIRE n.id IS UNIQUE;

CREATE CONSTRAINT sa_requirement_id IF NOT EXISTS
FOR (n:Requirement) REQUIRE n.id IS UNIQUE;

CREATE CONSTRAINT sa_domain_entity_id IF NOT EXISTS
FOR (n:DomainEntity) REQUIRE n.id IS UNIQUE;

CREATE CONSTRAINT sa_domain_entity_attr_id IF NOT EXISTS
FOR (n:DomainEntityAttribute) REQUIRE n.id IS UNIQUE;

CREATE CONSTRAINT sa_domain_entity_state_id IF NOT EXISTS
FOR (n:DomainEntityState) REQUIRE n.id IS UNIQUE;

CREATE CONSTRAINT sa_system_role_id IF NOT EXISTS
FOR (n:SystemRole) REQUIRE n.id IS UNIQUE;

CREATE CONSTRAINT sa_use_case_id IF NOT EXISTS
FOR (n:UseCase) REQUIRE n.id IS UNIQUE;

CREATE CONSTRAINT sa_form_id IF NOT EXISTS
FOR (n:Form) REQUIRE n.id IS UNIQUE;

CREATE CONSTRAINT sa_field_id IF NOT EXISTS
FOR (n:Field) REQUIRE n.id IS UNIQUE;

CREATE CONSTRAINT sa_ui_component_id IF NOT EXISTS
FOR (n:UIComponent) REQUIRE n.id IS UNIQUE;

CREATE CONSTRAINT sa_screen_id IF NOT EXISTS
FOR (n:Screen) REQUIRE n.id IS UNIQUE;

CREATE CONSTRAINT sa_permission_id IF NOT EXISTS
FOR (n:Permission) REQUIRE n.id IS UNIQUE;
