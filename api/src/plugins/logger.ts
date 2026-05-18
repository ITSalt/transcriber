/**
 * TECH-005 — Logger configuration
 * Returns Pino logger options with credential redaction.
 */
import type { FastifyServerOptions } from 'fastify'

type LoggerOptions = FastifyServerOptions['logger']

export function buildLoggerOptions(level: string, isPretty: boolean): LoggerOptions {
  return {
    level,
    redact: {
      paths: [
        'req.headers.authorization',
        'req.headers.cookie',
        '*.password',
        '*.token',
        '*.secret',
        '*.apiKey',
        '*.api_key',
      ],
      censor: '[REDACTED]',
    },
    ...(isPretty
      ? {
          transport: {
            target: 'pino-pretty',
            options: { colorize: true, translateTime: 'HH:MM:ss.l' },
          },
        }
      : {}),
  }
}
