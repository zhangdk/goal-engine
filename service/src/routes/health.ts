import { Hono } from 'hono';

export function healthRouter(): Hono {
  const router = new Hono();

  router.get('/', (c) => {
    return c.json({ data: { status: 'ok', timestamp: new Date().toISOString() } });
  });

  return router;
}
