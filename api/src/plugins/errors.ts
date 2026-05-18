/**
 * TECH-005 — Centralized error handler plugin
 * Maps AppError and Zod validation errors to structured JSON responses.
 *
 * Uses fastify-plugin to break encapsulation so the error handler applies
 * to all routes, including those registered at the root scope.
 */
import type { FastifyInstance, FastifyError } from 'fastify'
import fp from 'fastify-plugin'
import { hasZodFastifySchemaValidationErrors } from '@fastify/type-provider-zod'

// ─── AppError ─────────────────────────────────────────────────────────────────

export class AppError extends Error {
  constructor(
    public readonly code: string,
    public readonly statusCode: number,
    message: string,
    public readonly details?: unknown,
  ) {
    super(message)
    this.name = 'AppError'
  }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function isFastifyError(err: unknown): err is FastifyError {
  return (
    typeof err === 'object' &&
    err !== null &&
    'statusCode' in err &&
    typeof (err as Record<string, unknown>)['statusCode'] === 'number'
  )
}

// ─── Error handler plugin ─────────────────────────────────────────────────────

async function errorHandlerPluginImpl(app: FastifyInstance): Promise<void> {
  app.setErrorHandler<unknown>((error, _request, reply) => {
    // AppError — business/app-level errors with a stable code
    if (error instanceof AppError) {
      const body: Record<string, unknown> = {
        code: error.code,
        message: error.message,
      }
      if (error.details !== undefined) {
        body['details'] = error.details
      }
      return reply.status(error.statusCode).send(body)
    }

    // Zod schema validation errors (request body/query/params failed)
    if (hasZodFastifySchemaValidationErrors(error)) {
      return reply.status(400).send({
        code: 'VALIDATION_ERROR',
        message: 'Request validation failed',
        details: error.validation.map((v) => ({
          path: v.instancePath,
          message: v.message,
        })),
      })
    }

    // Fastify built-in errors (e.g. 404, 405) and generic errors with statusCode
    if (isFastifyError(error)) {
      const statusCode = error.statusCode ?? 500
      return reply.status(statusCode).send({
        code: 'HTTP_ERROR',
        message: error.message,
      })
    }

    // Unhandled errors — 500
    app.log.error(error)
    return reply.status(500).send({
      code: 'INTERNAL_ERROR',
      message: 'An unexpected error occurred',
    })
  })
}

export const errorHandlerPlugin = fp(errorHandlerPluginImpl, {
  name: 'error-handler',
  fastify: '5.x',
})
