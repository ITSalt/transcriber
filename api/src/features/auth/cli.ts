/**
 * FR-003 / UC-403 / A-1 — operator CLI for users, memberships and login blocks.
 * Runs from the built API (the prod VM has dist only):
 *
 *   pnpm --filter @transcrib/api run user:create -- --name "<имя>" --pin <6 цифр> [--workspace "<имя|id>"]
 *   pnpm --filter @transcrib/api run user:grant -- --user "<имя|id>" --workspace "<имя|id>"
 *   pnpm --filter @transcrib/api run user:reset-pin -- --user "<имя|id>" --pin <6 цифр>
 *   pnpm --filter @transcrib/api run user:blocks
 *   pnpm --filter @transcrib/api run user:unblock -- --client <ip> | --all
 *
 * Needs DATABASE_URL and PIN_PEPPER (api/.env). The PIN is never printed or logged.
 * Exit code 0 = done, 1 = refused (e.g. PIN taken), 2 = usage error.
 */
import { pathToFileURL } from 'node:url'
import type { PrismaClient } from '@prisma/client'
import { LOGIN_GLOBAL_CLIENT_KEY, PIN_PATTERN } from '@transcrib/shared'
import { hashPin, pinLookup } from './crypto.js'

export class CliError extends Error {
  constructor(message: string, readonly exitCode: 1 | 2 = 1) {
    super(message)
  }
}

type Args = Record<string, string | true>

export function parseArgs(argv: string[]): { command: string | undefined; args: Args } {
  const rest = argv.filter((a) => a !== '--')
  const command = rest[0]?.startsWith('--') ? undefined : rest.shift()
  const args: Args = {}
  for (let i = 0; i < rest.length; i++) {
    const a = rest[i]!
    if (!a.startsWith('--')) throw new CliError(`unexpected argument: ${a}`, 2)
    const key = a.slice(2)
    const next = rest[i + 1]
    if (next === undefined || next.startsWith('--')) args[key] = true
    else {
      args[key] = next
      i++
    }
  }
  return { command, args }
}

function str(args: Args, key: string): string {
  const v = args[key]
  if (typeof v !== 'string' || v.trim() === '') throw new CliError(`--${key} is required`, 2)
  return v.trim()
}

function checkPin(pin: string): string {
  if (!PIN_PATTERN.test(pin)) throw new CliError('PIN must be exactly 6 digits', 2)
  return pin
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

async function findWorkspace(db: PrismaClient, ref: string) {
  const found = UUID.test(ref)
    ? await db.workspace.findMany({ where: { id: ref } })
    : await db.workspace.findMany({ where: { name: ref } })
  if (found.length === 0) throw new CliError(`workspace not found: ${ref}`)
  if (found.length > 1) throw new CliError(`workspace name is ambiguous, use the id: ${found.map((w) => w.id).join(', ')}`)
  return found[0]!
}

async function findUser(db: PrismaClient, ref: string) {
  const found = UUID.test(ref)
    ? await db.user.findMany({ where: { id: ref } })
    : await db.user.findMany({ where: { name: ref } })
  if (found.length === 0) throw new CliError(`user not found: ${ref}`)
  if (found.length > 1) throw new CliError(`user name is ambiguous, use the id: ${found.map((u) => u.id).join(', ')}`)
  return found[0]!
}

async function assertPinFree(db: PrismaClient, lookup: string, exceptUserId?: string): Promise<void> {
  const owner = await db.user.findUnique({ where: { pinLookup: lookup }, select: { id: true } })
  if (owner && owner.id !== exceptUserId) throw new CliError('this PIN is already taken — choose another one')
}

export interface CliDeps {
  db: PrismaClient
  pepper: string | undefined
  out: (line: string) => void
}

export async function runCli(argv: string[], deps: CliDeps): Promise<void> {
  const { command, args } = parseArgs(argv)
  const { db, out } = deps
  const pepper = (): string => {
    if (!deps.pepper) throw new CliError('PIN_PEPPER is not set (api/.env) — refusing to touch PINs')
    return deps.pepper
  }

  switch (command) {
    case 'create': {
      const name = str(args, 'name')
      const pin = checkPin(str(args, 'pin'))
      const lookup = pinLookup(pin, pepper())
      await assertPinFree(db, lookup)
      const workspaceRef = typeof args['workspace'] === 'string' ? args['workspace'].trim() : undefined
      const pinHash = await hashPin(pin)
      const result = await db.$transaction(async (tx) => {
        const workspace = workspaceRef
          ? await findWorkspace(tx as unknown as PrismaClient, workspaceRef)
          : await tx.workspace.create({ data: { name, personal: true } })
        const user = await tx.user.create({ data: { name, pinLookup: lookup, pinHash } })
        await tx.membership.create({ data: { userId: user.id, workspaceId: workspace.id } })
        return { user, workspace }
      })
      out(`created user ${result.user.name} (${result.user.id}) in workspace ${result.workspace.name} (${result.workspace.id})`)
      return
    }
    case 'grant': {
      const user = await findUser(db, str(args, 'user'))
      const workspace = await findWorkspace(db, str(args, 'workspace'))
      await db.membership.upsert({
        where: { userId_workspaceId: { userId: user.id, workspaceId: workspace.id } },
        create: { userId: user.id, workspaceId: workspace.id },
        update: {},
      })
      out(`granted ${user.name} access to workspace ${workspace.name} (${workspace.id})`)
      return
    }
    case 'reset-pin': {
      const user = await findUser(db, str(args, 'user'))
      const pin = checkPin(str(args, 'pin'))
      const lookup = pinLookup(pin, pepper())
      await assertPinFree(db, lookup, user.id)
      const pinHash = await hashPin(pin)
      await db.$transaction([
        db.user.update({ where: { id: user.id }, data: { pinLookup: lookup, pinHash } }),
        db.authSession.deleteMany({ where: { userId: user.id } }),
      ])
      out(`PIN of ${user.name} reset; their sessions were ended`)
      return
    }
    case 'blocks': {
      const rows = await db.loginBlock.findMany({ orderBy: { updatedAt: 'desc' } })
      if (rows.length === 0) out('no failed logins recorded')
      for (const r of rows) {
        const label = r.clientKey === LOGIN_GLOBAL_CLIENT_KEY ? '(all clients, current hour)' : r.clientKey
        out(`${label}\tfailed=${r.failedCount}\t${r.blockedAt ? `BLOCKED since ${r.blockedAt.toISOString()}` : 'not blocked'}`)
      }
      return
    }
    case 'unblock': {
      if (args['all'] === true) {
        const res = await db.loginBlock.deleteMany({ where: { clientKey: { not: LOGIN_GLOBAL_CLIENT_KEY } } })
        out(`unblocked all clients (${res.count} rows cleared)`)
        return
      }
      const client = str(args, 'client')
      const res = await db.loginBlock.deleteMany({ where: { clientKey: client } })
      if (res.count === 0) throw new CliError(`no record for client ${client}`)
      out(`unblocked ${client}`)
      return
    }
    default:
      throw new CliError('usage: <create|grant|reset-pin|blocks|unblock> [--options]  (see api/README.md)', 2)
  }
}

// ── entry point (node dist/features/auth/cli.js <command> …) ───────────────
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const [{ config }, { prisma }] = await Promise.all([import('../../config.js'), import('../../db.js')])
  try {
    await runCli(process.argv.slice(2), { db: prisma, pepper: config.PIN_PEPPER, out: (l) => console.log(l) })
  } catch (err) {
    const code = err instanceof CliError ? err.exitCode : 1
    console.error(err instanceof Error ? err.message : String(err))
    process.exitCode = code
  } finally {
    await prisma.$disconnect()
  }
}
