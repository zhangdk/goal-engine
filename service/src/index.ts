import { serve } from '@hono/node-server';
import { createDb } from './db/client.js';
import { createApp } from './app.js';

const DB_PATH = process.env['DB_PATH'] ?? './goal-engine.db';
const PORT = Number(process.env['PORT'] ?? 3100);

const db = createDb(DB_PATH);
const app = createApp(db);

serve({ fetch: app.fetch, port: PORT }, (info) => {
  console.log(`Goal Engine service running on http://localhost:${info.port}`);
});
