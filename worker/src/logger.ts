/**
 * TECH-006 — Worker logger
 * Pino logger mirroring api/ conventions (TECH-005).
 */
import pino, { type Logger } from 'pino'

export function buildLogger(level: string, isPretty: boolean): Logger {
  return pino({
    level,
    redact: {
      paths: [
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
  })
}
