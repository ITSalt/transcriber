/**
 * FR-004 — projects, participants, glossary (WP-API-PROJECTS-01; contract: shared/src/api/project.ts).
 *
 * Isolation: `/api/projects/:projectId/…` is checked by the auth plugin before validation
 * (foreign = nonexistent = 404); workspace ids in a body/query go through assertWorkspaceAccess.
 * Children (participant, term) are looked up WITH their projectId, so another project's child
 * id answers the same 404.
 */
import type { FastifyInstance } from 'fastify'
import type { ZodTypeProvider } from '@fastify/type-provider-zod'
import { z } from 'zod'
import {
  GlossaryTerm as GlossaryTermDto,
  GlossaryTermInput,
  GlossaryTermUpdate,
  LastProtocolResponse,
  ProjectCreateRequest,
  ProjectDetailResponse,
  ProjectListQuery,
  ProjectListResponse,
  ProjectParticipant as ParticipantDto,
  ParticipantInput,
  ParticipantUpdate,
  ProjectUpdateRequest,
} from '@transcrib/shared'
import { prisma } from '../../db.js'
import { assertWorkspaceAccess, notFound } from '../auth/access.js'
import { lastProtocolOf, previousProtocolUnavailable } from '../context/service.js'

const ProjectParams = z.object({ projectId: z.string().uuid() })
const ParticipantParams = ProjectParams.extend({ participantId: z.string().uuid() })
const TermParams = ProjectParams.extend({ termId: z.string().uuid() })

type ProjectRow = { id: string; workspaceId: string; name: string; description: string | null; createdAt: Date; updatedAt: Date }

const summary = (p: ProjectRow, meetingCount: number) => ({
  id: p.id,
  workspace_id: p.workspaceId,
  name: p.name,
  description: p.description,
  meeting_count: meetingCount,
  created_at: p.createdAt.toISOString(),
  updated_at: p.updatedAt.toISOString(),
})

const participantDto = (p: { id: string; name: string; aliases: string[]; role: string | null; organization: string | null; side: string }) => ({
  id: p.id,
  name: p.name,
  aliases: p.aliases,
  role: p.role,
  organization: p.organization,
  side: p.side as ParticipantDto['side'],
})

const termDto = (t: { id: string; term: string; variants: string[]; definition: string | null; asrKeyterm: boolean }): GlossaryTermDto => ({
  id: t.id,
  term: t.term,
  variants: t.variants,
  definition: t.definition,
  asr_keyterm: t.asrKeyterm,
})

async function detail(projectId: string) {
  const project = await prisma.project.findUnique({
    where: { id: projectId },
    include: {
      participants: { orderBy: { createdAt: 'asc' } },
      glossary: { orderBy: { createdAt: 'asc' } },
      _count: { select: { meetings: true } },
    },
  })
  if (!project) throw notFound()
  return {
    project: summary(project, project._count.meetings),
    participants: project.participants.map(participantDto),
    glossary: project.glossary.map(termDto),
  }
}

export default async function projectsRoutes(app: FastifyInstance): Promise<void> {
  const r = app.withTypeProvider<ZodTypeProvider>()

  r.get('/api/projects', { schema: { querystring: ProjectListQuery, response: { 200: ProjectListResponse } } }, async (request) => {
    const workspaceId = assertWorkspaceAccess(request, request.query.workspace_id)
    const rows = await prisma.project.findMany({
      where: { workspaceId },
      orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
      include: { _count: { select: { meetings: true } } },
    })
    return { items: rows.map((p) => summary(p, p._count.meetings)) }
  })

  r.post('/api/projects', { schema: { body: ProjectCreateRequest, response: { 201: ProjectDetailResponse } } }, async (request, reply) => {
    const workspaceId = assertWorkspaceAccess(request, request.body.workspace_id)
    const created = await prisma.project.create({
      data: { workspaceId, name: request.body.name, description: request.body.description ?? null },
    })
    return reply.status(201).send(await detail(created.id))
  })

  r.get('/api/projects/:projectId', { schema: { params: ProjectParams, response: { 200: ProjectDetailResponse } } }, async (request) =>
    detail(request.params.projectId),
  )

  r.patch(
    '/api/projects/:projectId',
    { schema: { params: ProjectParams, body: ProjectUpdateRequest, response: { 200: ProjectDetailResponse } } },
    async (request) => {
      const { name, description } = request.body
      await prisma.project.update({
        where: { id: request.params.projectId },
        data: { ...(name !== undefined ? { name } : {}), ...(description !== undefined ? { description } : {}) },
      })
      return detail(request.params.projectId)
    },
  )

  // meetings keep (projectId → NULL by the FK's ON DELETE SET NULL); participants/terms cascade
  r.delete('/api/projects/:projectId', { schema: { params: ProjectParams } }, async (request, reply) => {
    // FR-006 / D-13: the project's memory graph is removed by the worker; the outbox row is
    // written in the SAME transaction as the delete (contract neo4j.md §6)
    const { projectId, workspaceId } = request.projectAccess!
    await prisma.$transaction(async (tx) => {
      await tx.graphOutbox.create({
        data: { op: 'DELETE_PROJECT', payload: { project_id: projectId, workspace_id: workspaceId } },
      })
      await tx.project.delete({ where: { id: projectId } })
    })
    return reply.status(204).send()
  })

  // ── participants ───────────────────────────────────────────────────────────
  r.post(
    '/api/projects/:projectId/participants',
    { schema: { params: ProjectParams, body: ParticipantInput, response: { 201: ParticipantDto } } },
    async (request, reply) => {
      const created = await prisma.projectParticipant.create({
        data: { ...request.body, projectId: request.params.projectId, role: request.body.role ?? null, organization: request.body.organization ?? null },
      })
      return reply.status(201).send(participantDto(created))
    },
  )

  r.patch(
    '/api/projects/:projectId/participants/:participantId',
    { schema: { params: ParticipantParams, body: ParticipantUpdate, response: { 200: ParticipantDto } } },
    async (request) => {
      const { projectId, participantId } = request.params
      const found = await prisma.projectParticipant.findFirst({ where: { id: participantId, projectId }, select: { id: true } })
      if (!found) throw notFound()
      return participantDto(await prisma.projectParticipant.update({ where: { id: participantId }, data: request.body }))
    },
  )

  r.delete('/api/projects/:projectId/participants/:participantId', { schema: { params: ParticipantParams } }, async (request, reply) => {
    const { projectId, participantId } = request.params
    const { count } = await prisma.projectParticipant.deleteMany({ where: { id: participantId, projectId } })
    if (count === 0) throw notFound()
    return reply.status(204).send()
  })

  // ── glossary ───────────────────────────────────────────────────────────────
  r.post(
    '/api/projects/:projectId/glossary',
    { schema: { params: ProjectParams, body: GlossaryTermInput, response: { 201: GlossaryTermDto } } },
    async (request, reply) => {
      const { asr_keyterm, definition, ...rest } = request.body
      const created = await prisma.glossaryTerm.create({
        data: { ...rest, definition: definition ?? null, asrKeyterm: asr_keyterm, projectId: request.params.projectId },
      })
      return reply.status(201).send(termDto(created))
    },
  )

  r.patch(
    '/api/projects/:projectId/glossary/:termId',
    { schema: { params: TermParams, body: GlossaryTermUpdate, response: { 200: GlossaryTermDto } } },
    async (request) => {
      const { projectId, termId } = request.params
      const found = await prisma.glossaryTerm.findFirst({ where: { id: termId, projectId }, select: { id: true } })
      if (!found) throw notFound()
      const { asr_keyterm, ...rest } = request.body
      return termDto(
        await prisma.glossaryTerm.update({
          where: { id: termId },
          data: { ...rest, ...(asr_keyterm !== undefined ? { asrKeyterm: asr_keyterm } : {}) },
        }),
      )
    },
  )

  r.delete('/api/projects/:projectId/glossary/:termId', { schema: { params: TermParams } }, async (request, reply) => {
    const { projectId, termId } = request.params
    const { count } = await prisma.glossaryTerm.deleteMany({ where: { id: termId, projectId } })
    if (count === 0) throw notFound()
    return reply.status(204).send()
  })

  // ── last protocol ──────────────────────────────────────────────────────────
  r.get(
    '/api/projects/:projectId/last-protocol',
    { schema: { params: ProjectParams, response: { 200: LastProtocolResponse } } },
    async (request) => {
      const last = await lastProtocolOf(request.params.projectId)
      if (!last) throw previousProtocolUnavailable()
      return last
    },
  )
}
