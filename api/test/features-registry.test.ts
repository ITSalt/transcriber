/**
 * WP-BACKEND-06 AC-4 — a feature folder with routes.ts is registered without editing
 * server.ts. Covers the registry in isolation (temp dir) and through the real buildApp()
 * with a temporary folder inside api/src/features.
 */
import { describe, it, expect, vi, afterEach } from 'vitest'
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import Fastify from 'fastify'

vi.mock('../src/plugins/sse.js', () => ({
  ssePlugin: async () => {},
}))
vi.mock('../src/config.js', () => ({
  config: {
    NODE_ENV: 'test',
    PORT: 3000,
    LOG_LEVEL: 'silent',
    DATABASE_URL: 'postgresql://test:test@localhost:5432/test',
    REDIS_URL: 'redis://localhost:6379',
  },
}))
vi.mock('../src/db.js', () => ({ prisma: {} }))

import { discoverFeatures, registerFeatures, FEATURES_DIR } from '../src/features/index.js'

const cleanup: string[] = []
afterEach(() => {
  for (const p of cleanup.splice(0)) rmSync(p, { recursive: true, force: true })
})

function feature(dir: string, name: string, file: string, body: string): void {
  mkdirSync(join(dir, name), { recursive: true })
  writeFileSync(join(dir, name, file), body)
}

describe('feature registry (api/src/features/index.ts)', () => {
  it('discovers folders with routes.{js,ts}, alphabetical; skips _/. folders and folders without routes', () => {
    const dir = mkdtempSync(join(tmpdir(), 'features-'))
    cleanup.push(dir)
    feature(dir, 'zeta', 'routes.js', 'export default async function (app) {}')
    feature(dir, 'alpha', 'routes.ts', 'export default async function (app: unknown) {}')
    feature(dir, '_draft', 'routes.ts', 'export default async function () {}')
    feature(dir, 'helpers', 'util.ts', 'export const x = 1')
    expect(discoverFeatures(dir).map((f) => f.name)).toEqual(['alpha', 'zeta'])
  })

  it('registers each feature plugin so its routes answer', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'features-'))
    cleanup.push(dir)
    feature(dir, 'demo', 'routes.js', `export default async function (app) { app.get('/api/__demo', async () => ({ ok: 'demo' })) }`)
    const app = Fastify()
    expect(await registerFeatures(app, dir)).toEqual(['demo'])
    const res = await app.inject({ method: 'GET', url: '/api/__demo' })
    expect(res.statusCode).toBe(200)
    expect(res.json()).toEqual({ ok: 'demo' })
    await app.close()
  })

  it('fails loudly when routes has no plugin default export', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'features-'))
    cleanup.push(dir)
    feature(dir, 'broken', 'routes.js', 'export const routes = 1')
    await expect(registerFeatures(Fastify(), dir)).rejects.toThrow(/broken.*default-export/)
  })

  it('a missing features directory registers nothing', async () => {
    expect(await registerFeatures(Fastify(), join(tmpdir(), 'does-not-exist-features'))).toEqual([])
  })

  it('the default registry root is api/src/features (dist/features after tsc)', () => {
    expect(FEATURES_DIR.replace(/\\/g, '/')).toMatch(/\/api\/src\/features\/?$/)
    // every real feature folder present on this branch is discoverable from the default
    expect(() => discoverFeatures()).not.toThrow()
  })

  it('buildApp() registers a new feature folder (routes.ts) next to the core routes — server.ts untouched', async () => {
    // A temp copy of the features root, so parallel test files that call buildApp() never
    // see a half-written folder inside src/.
    const dir = mkdtempSync(join(tmpdir(), 'features-app-'))
    cleanup.push(dir)
    feature(dir, 'demo', 'routes.ts', `import type { FastifyInstance } from 'fastify'
export default async function routes(app: FastifyInstance) {
  app.get('/api/demo-feature', async () => ({ feature: 'demo' }))
}
`)
    const { buildApp } = await import('../src/server.js')
    const app = await buildApp({ logLevel: 'silent', featuresDir: dir })
    const res = await app.inject({ method: 'GET', url: '/api/demo-feature' })
    expect(res.statusCode).toBe(200)
    expect(res.json()).toEqual({ feature: 'demo' })
    expect((await app.inject({ method: 'GET', url: '/api/health' })).statusCode).not.toBe(404)
    await app.close()
  }, 30_000) // buildApp() imports every core route module — slow under a loaded parallel run
})

describe('program dependencies load on Fastify 5', () => {
  it('@fastify/cookie and @fastify/multipart register; jszip and fast-xml-parser import', async () => {
    const app = Fastify()
    await app.register((await import('@fastify/cookie')).default)
    await app.register((await import('@fastify/multipart')).default)
    await app.ready()
    const JSZip = (await import('jszip')).default
    const zip = new JSZip()
    zip.file('word/document.xml', '<w:document><w:body/></w:document>')
    const { XMLParser } = await import('fast-xml-parser')
    const xml = await (await JSZip.loadAsync(await zip.generateAsync({ type: 'uint8array' }))).file('word/document.xml')!.async('string')
    expect(new XMLParser().parse(xml)).toHaveProperty('w:document')
    await app.close()
  }, 30_000)
})
