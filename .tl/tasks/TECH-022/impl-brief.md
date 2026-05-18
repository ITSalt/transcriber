# TECH-022 — Implementation brief

## Why split health from readiness

The deploy workflow runs `curl /api/health` for up to 30 attempts × 5s — a liveness probe. If we wired it to a DB ping, every deploy would race the pm2 restart against Prisma reconnect, and a transient DB hiccup during reload would mark deploy as failed. Liveness ≠ readiness; deploy only needs liveness.

If we add readiness later, it lives at `/api/ready` and probes Postgres + Redis.

## Sketch

```ts
// api/src/routes/health.ts
import type { FastifyPluginAsync } from 'fastify';

export const healthRoute: FastifyPluginAsync = async (fastify) => {
  fastify.get('/api/health', { logLevel: 'debug' }, async (req, reply) => {
    if (fastify.shuttingDown) {
      reply.code(503);
      return { status: 'shutting_down' };
    }
    return {
      status: 'ok',
      version: process.env.npm_package_version ?? 'unknown',
      ts: new Date().toISOString(),
    };
  });
};
```

```ts
// api/src/server.ts (bootstrap)
const fastify = Fastify({ /* ... */ });
fastify.decorate('shuttingDown', false);

async function shutdown(signal: string) {
  if (fastify.shuttingDown) return;
  fastify.shuttingDown = true;
  fastify.log.info({ signal }, 'shutting down');
  const timer = setTimeout(() => {
    fastify.log.error('graceful shutdown timeout, exiting 1');
    process.exit(1);
  }, 25_000);
  try {
    await fastify.close();
    await prisma.$disconnect();
    await redis.quit();
    clearTimeout(timer);
    process.exit(0);
  } catch (err) {
    fastify.log.error({ err }, 'shutdown error');
    process.exit(1);
  }
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
```

```ts
// worker/src/index.ts
const workers: Worker[] = [/* transcription, protocol, etc. */];

async function shutdown(signal: string) {
  logger.info({ signal }, 'worker shutting down');
  const timer = setTimeout(() => process.exit(1), 25_000);
  try {
    await Promise.all(workers.map((w) => w.close())); // BullMQ lets in-flight jobs finish
    // Kill any ffmpeg child processes we spawned.
    await ffmpegRegistry.terminateAll();
    await prisma.$disconnect();
    await redis.quit();
    clearTimeout(timer);
    process.exit(0);
  } catch (err) {
    logger.error({ err }, 'worker shutdown error');
    process.exit(1);
  }
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
```

## Note on ffmpeg child processes

`fluent-ffmpeg` lets you keep a registry of running processes. The worker must track them and call `proc.kill('SIGTERM')` during shutdown. Otherwise pm2 force-kills the parent but leaves orphan ffmpeg processes consuming CPU until they finish — measurable as a leaked CPU spike right after every deploy.

## Note on BullMQ `worker.close()`

`worker.close()` waits up to `closeTimeout` (default 5s) for current jobs to finish. For a job that's mid-ffmpeg, 5s isn't enough — we let the ffmpeg process abort via SIGTERM (above), which makes the BullMQ job throw, which BullMQ marks as failed and reschedules. Idempotent, no data loss.
