import fs from 'node:fs';
import path from 'node:path';
import dotenv from 'dotenv';
import request from 'supertest';

// Load .env.production.local
const prodEnvPath = path.resolve(process.cwd(), '.env.production.local');
const prodEnv = dotenv.parse(fs.readFileSync(prodEnvPath));
delete process.env.DATABASE_URL;
for (const [k, v] of Object.entries(prodEnv)) {
  process.env[k] = v;
}

import { resolveDatabaseConfiguration } from '../backend/src/config/databaseUrl.js';
const config = resolveDatabaseConfiguration(process.env);
process.env.DATABASE_URL = config.databaseUrl;
console.log('Target DATABASE_URL configured:', config.databaseUrl.replace(/:[^:@]+@/, ':****@'));

import app from '../backend/src/app.js';

async function testProbes() {
  console.log('Testing Express app with production database configuration...');
  const server = app;

  console.log('1. GET /health');
  const healthRes = await request(server).get('/health');
  console.log('Health status:', healthRes.status, healthRes.body);

  console.log('\n2. GET /ready');
  const readyRes = await request(server).get('/ready');
  console.log('Ready status:', readyRes.status, readyRes.body);

  if (healthRes.status === 200 && readyRes.status === 200 && readyRes.body.database === 'CONNECTED') {
    console.log('\n🎉 ALL EXPRESS PROBES PASSED: HTTP 200 WITH DATABASE CONNECTED');
  } else {
    console.error('\n❌ Probe test failed');
    process.exit(1);
  }
}

testProbes().catch(err => {
  console.error('Fatal probe error:', err);
  process.exit(1);
});
