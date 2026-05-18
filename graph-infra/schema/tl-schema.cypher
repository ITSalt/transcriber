// TL Layer Schema — 3 node types
// Run after sa-schema.cypher

CREATE CONSTRAINT tl_wave_id IF NOT EXISTS
FOR (n:Wave) REQUIRE n.id IS UNIQUE;

CREATE CONSTRAINT tl_task_id IF NOT EXISTS
FOR (n:Task) REQUIRE n.id IS UNIQUE;

CREATE CONSTRAINT tl_api_contract_id IF NOT EXISTS
FOR (n:ApiContract) REQUIRE n.id IS UNIQUE;
