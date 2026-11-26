// Explicit opt-in test entry point. Never imported by the production server.
import { readFile, readdir } from 'node:fs/promises';
import { once } from 'node:events';
import express from 'express';
import pg from 'pg';
import bcrypt from 'bcrypt';

const connection = process.env.TEST_DATABASE_URL;
const fixtureKey = process.env.E2E_FIXTURE_KEY;
if (!connection || !fixtureKey) throw Error('Provide TEST_DATABASE_URL and E2E_FIXTURE_KEY for isolated browser testing.');
let url;
try { url = new URL(connection); } catch { throw Error('Invalid test database URL'); }
if (!['127.0.0.1', 'localhost'].includes(url.hostname) || url.search || !/^\/careeros_test_browser_[a-z0-9_]+$/.test(url.pathname)) {
  throw Error('Browser fixture requires a fresh loopback careeros_test_browser_<suffix> database.');
}
const port = Number(process.env.TEST_BACKEND_PORT || 3000);
if (!Number.isInteger(port) || port < 1 || port > 65535) throw Error('Invalid test backend port');
Object.assign(process.env, { DATABASE_URL: connection, NODE_ENV: 'test', PORT: String(port), CORS_ORIGINS: process.env.TEST_FRONTEND_ORIGIN || 'http://localhost:5173' });
const database = new pg.Client({ connectionString: connection, connectionTimeoutMillis: 5000, query_timeout: 15000 });
try {
  await database.connect();
  if ((await database.query("SELECT table_name FROM information_schema.tables WHERE table_schema='public'")).rowCount) throw Error('Refusing to mutate a nonempty browser-test database');
  const directory = new URL('../../prisma/migrations/', import.meta.url);
  for (const migration of (await readdir(directory, { withFileTypes: true })).filter(entry => entry.isDirectory()).map(entry => entry.name).sort()) {
    await database.query(await readFile(new URL(`${migration}/migration.sql`, directory), 'utf8'));
  }
  await database.query('INSERT INTO "User" (name,email,"passwordHash","updatedAt") VALUES ($1,$2,$3,NOW())',
    ['Aarav Student', 'ui-student@example.test', await bcrypt.hash('Fictional browser test passphrase!', 12)]);
} finally { await database.end(); }
const { createApp } = await import('../../src/app.ts');
const { default: prisma } = await import('../../src/config/prisma.ts');
const fixture = express();
fixture.get('/api/__local_fixture__', (_req, res) => res.json({ fixtureKey }));
fixture.use(createApp());
const server = fixture.listen(port, '127.0.0.1'); await once(server, 'listening');
console.log('Isolated browser fixture ready on loopback');
let stopping;
const stop = () => stopping ??= (async () => { await new Promise(resolve => server.close(resolve)); await prisma.$disconnect(); })();
process.on('message', message => { if (message === 'shutdown') void stop().then(() => process.exit(0)); });
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => { void stop().then(() => process.exit(0)); });
