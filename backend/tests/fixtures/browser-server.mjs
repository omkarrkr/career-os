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
  const owner = (await database.query('INSERT INTO "User" (name,email,"passwordHash","updatedAt") VALUES ($1,$2,$3,NOW()) RETURNING id',
    ['Aarav Student', 'ui-student@example.test', await bcrypt.hash('Fictional browser test passphrase!', 12)])).rows[0];
  await database.query(`INSERT INTO "Goal" (title,category,status,"targetDate","userId") VALUES ('Plan my first portfolio project','Projects','ACTIVE','2099-01-01',$1),('Read the TypeScript handbook','Learning','COMPLETED','2000-01-01',$1)`,[owner.id]);
  const peer=(await database.query(`INSERT INTO "User" (name,email,"passwordHash","updatedAt") VALUES ('Fictional peer','peer@example.test','fixture-only',NOW()) RETURNING id`)).rows[0];
  await database.query(`INSERT INTO "Goal" (title,category,status,"targetDate","userId") VALUES ('Peer private goal','Private','ACTIVE','2000-01-01',$1)`,[peer.id]);
  // A separate fictional account keeps custom-skill CRUD independent of other suites.
  await database.query('INSERT INTO "User" (name,email,"passwordHash","updatedAt") VALUES ($1,$2,$3,NOW())',
    ['Custom Skill Student','custom-skills@example.test',await bcrypt.hash('Fictional browser test passphrase!',12)]);
  await database.query('INSERT INTO "User" (name,email,"passwordHash","updatedAt") VALUES ($1,$2,$3,NOW())',
    ['Project Link Student','project-links@example.test',await bcrypt.hash('Fictional browser test passphrase!',12)]);
} finally { await database.end(); }
const { createApp } = await import('../../src/app.ts');
const { default: prisma } = await import('../../src/config/prisma.ts');
const fixture = express();
// Prebuild before listening, as express-rate-limit requires initialization outside requests.
const suiteApplications = Array.from({ length: 12 }, () => createApp());
let application = suiteApplications.shift();
fixture.get('/api/__local_fixture__', (_req, res) => res.json({ fixtureKey }));
// Test-only process state isolation: no data/session changes, production limits unchanged.
fixture.post('/api/__local_fixture__/new-suite', (req, res) => {
  if (req.get('X-Fixture-Key') !== fixtureKey) return res.sendStatus(403);
  if (!suiteApplications.length) return res.sendStatus(409);
  application = suiteApplications.shift();
  res.sendStatus(204);
});
fixture.use((req, res, next) => application(req, res, next));
const server = fixture.listen(port, '127.0.0.1'); await once(server, 'listening');
console.log('Isolated browser fixture ready on loopback');
let stopping;
const stop = () => stopping ??= (async () => { await new Promise(resolve => server.close(resolve)); await prisma.$disconnect(); })();
process.on('message', message => { if (message === 'shutdown') void stop().then(() => process.exit(0)); });
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => { void stop().then(() => process.exit(0)); });
