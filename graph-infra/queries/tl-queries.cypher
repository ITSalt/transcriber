// TL Layer Queries — used by nacl-tl-plan, nacl-tl-status, nacl-tl-next

// tl_wave_summary — all waves with task counts and status
// MATCH (wave:Wave)
// OPTIONAL MATCH (wave)-[:CONTAINS_TASK]->(task:Task)
// RETURN wave.id, wave.number, wave.name,
//        count(task) AS totalTasks,
//        sum(CASE WHEN task.status = 'done' THEN 1 ELSE 0 END) AS doneTasks,
//        sum(CASE WHEN task.status = 'in_progress' THEN 1 ELSE 0 END) AS inProgressTasks
// ORDER BY wave.number

// tl_task_detail — full task info with UC and module context
// MATCH (task:Task {id: $taskId})
// OPTIONAL MATCH (task)-[:IMPLEMENTS]->(uc:UseCase)
// OPTIONAL MATCH (m:Module)-[:CONTAINS_UC]->(uc)
// OPTIONAL MATCH (wave:Wave)-[:CONTAINS_TASK]->(task)
// RETURN task, uc, m, wave

// tl_next_tasks — tasks ready to start (dependencies done)
// MATCH (task:Task)
// WHERE task.status = 'pending'
//   AND NOT (task)-[:DEPENDS_ON]->(:Task {status: 'pending'})
//   AND NOT (task)-[:DEPENDS_ON]->(:Task {status: 'in_progress'})
// OPTIONAL MATCH (wave:Wave)-[:CONTAINS_TASK]->(task)
// RETURN task, wave.number AS waveNumber ORDER BY waveNumber, task.id

// tl_blocked_tasks — tasks blocked by incomplete dependencies
// MATCH (task:Task)-[:DEPENDS_ON]->(dep:Task)
// WHERE task.status = 'pending' AND dep.status IN ['pending', 'in_progress']
// RETURN task.id, task.name, dep.id AS blockedBy, dep.status AS depStatus

// tl_api_contracts — all API contracts
// MATCH (contract:ApiContract)
// OPTIONAL MATCH (contract)-[:DEFINED_FOR]->(uc:UseCase)
// RETURN contract, uc.id AS useCase ORDER BY contract.id
