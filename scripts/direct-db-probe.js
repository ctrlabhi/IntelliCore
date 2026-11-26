import fs from 'node:fs';
import dotenv from 'dotenv';
import { spawn } from 'node:child_process';

const env = dotenv.parse(fs.readFileSync('.env.production.local'));
const password = env.DB_PASSWORD;
const host = env.DB_HOST || '193.203.184.196';
const port = env.DB_PORT || '3306';
const user = env.DB_USER || 'u740799251_intellicore';
const database = env.DB_NAME || 'u740799251_intellicore';

console.log('Connecting to remote MySQL/MariaDB server...');
console.log(`Host: ${host}:${port}, User: ${user}, Database: ${database}`);

const query = "SELECT @@hostname; SELECT @@version_comment; SELECT @@ssl_cipher;";

const child = spawn('docker', [
  'exec',
  '-i',
  '-e', `MYSQL_PWD=${password}`,
  'intellicore_mysql',
  'mysql',
  '-h', host,
  '-P', port,
  '-u', user,
  '-D', database,
  '--ssl-mode=REQUIRED',
  '-e', query
]);

let stdout = '';
let stderr = '';

child.stdout.on('data', d => stdout += d.toString());
child.stderr.on('data', d => stderr += d.toString());

child.on('close', (code) => {
  if (code === 0) {
    console.log('✅ DIRECT MYSQL CONNECTION SUCCESSFUL (TLS ENCRYPTED)!');
    console.log('----------------------------------------------------');
    console.log(stdout);
    console.log('----------------------------------------------------');
  } else {
    console.error(`❌ Process exited with code ${code}`);
    if (stderr) console.error('Stderr:', stderr.trim());
    if (stdout) console.log('Stdout:', stdout.trim());
  }
});
