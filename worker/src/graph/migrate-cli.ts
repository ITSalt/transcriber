/** Entry of the `graph:migrate` script (node dist/graph/migrate-cli.js). */
import 'dotenv/config'
import { runGraphMigrate } from './migrate.js'

const code = await runGraphMigrate(process.env, {
  info: (m) => console.log(m),
  warn: (m) => console.warn(m),
  error: (m) => console.error(m),
})
process.exit(code)
