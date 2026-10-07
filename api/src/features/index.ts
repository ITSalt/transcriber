/**
 * WP-BACKEND-06 (D-15) — feature registry.
 *
 * Every folder `api/src/features/<name>/` that has a `routes.ts` (compiled: `routes.js`)
 * is registered by buildApp() — a new feature needs NO edit of server.ts or of this file,
 * so parallel packages never touch a shared file to wire their routes.
 *
 * Feature module contract:
 *   // api/src/features/<name>/routes.ts
 *   export default async function routes(app: FastifyInstance) { app.get('/api/...', …) }
 *
 *   - default export = a Fastify plugin. It is encapsulated like any app.register() call;
 *     wrap it in fastify-plugin to add root-level hooks/decorators (e.g. the auth
 *     onRequest hook of `auth`) — root hooks apply to every route, old ones included.
 *   - full paths (`/api/...`), no prefix is added.
 *   - folders whose name starts with `_` or `.` are ignored, as are folders without routes.
 *   - load order is alphabetical, so it is deterministic; do not rely on it for behaviour.
 * A folder with a routes file but no plugin default export fails startup loudly.
 */
import { existsSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import type { FastifyInstance, FastifyPluginAsync, FastifyPluginCallback } from 'fastify'

/** Directory of this file — `src/features` under vitest/tsx, `dist/features` in prod. */
export const FEATURES_DIR = fileURLToPath(new URL('.', import.meta.url))

const ROUTE_FILES = ['routes.js', 'routes.ts'] as const

export interface FeatureModule {
  name: string
  file: string
}

/** Feature folders with a routes file, alphabetical. */
export function discoverFeatures(dir: string = FEATURES_DIR): FeatureModule[] {
  if (!existsSync(dir)) return []
  return readdirSync(dir, { withFileTypes: true })
    .filter((e) => e.isDirectory() && !e.name.startsWith('_') && !e.name.startsWith('.'))
    .map((e) => e.name)
    .sort()
    .flatMap((name) => {
      const file = ROUTE_FILES.map((f) => join(dir, name, f)).find((p) => existsSync(p))
      return file ? [{ name, file }] : []
    })
}

/** Imports and registers every discovered feature. Returns the registered names. */
export async function registerFeatures(
  app: FastifyInstance,
  dir: string = FEATURES_DIR,
): Promise<string[]> {
  const features = discoverFeatures(dir)
  for (const feature of features) {
    const mod = (await import(pathToFileURL(feature.file).href)) as {
      default?: FastifyPluginAsync | FastifyPluginCallback
    }
    if (typeof mod.default !== 'function') {
      throw new Error(`feature "${feature.name}": ${feature.file} must default-export a Fastify plugin`)
    }
    await app.register(mod.default)
  }
  if (features.length > 0) {
    app.log.info({ features: features.map((f) => f.name) }, 'feature modules registered')
  }
  return features.map((f) => f.name)
}
