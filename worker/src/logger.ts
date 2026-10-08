/**
 * TECH-006 — Worker logger
 * Pino logger mirroring api/ conventions (TECH-005).
 */
import pino, { type Logger } from 'pino'
import { describeLlmSettings, resolveLlmSettings } from './llm/provider.js'

export function buildLogger(level: string, isPretty: boolean): Logger {
  const log = pino({
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
  // WP-WORKER-03: one startup line; an invalid LLM configuration stops the worker here
  log.info(describeLlmSettings(resolveLlmSettings()))
  return log
}
