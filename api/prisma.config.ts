import { defineConfig } from 'prisma/config'
import { loadEnvFile } from 'node:process'

// Load .env for local development (no-op if the file doesn't exist)
try {
  loadEnvFile('.env')
} catch {
  // .env is optional — CI/production injects vars directly
}

export default defineConfig({
  schema: 'prisma/schema.prisma',
  datasource: {
    url: process.env['DATABASE_URL'] ?? 'postgresql://transcrib:transcrib@localhost:5432/transcrib',
  },
})
