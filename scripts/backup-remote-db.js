import fs from 'node:fs';
import dotenv from 'dotenv';
import { spawn } from 'node:child_process';

const env = dotenv.parse(fs.readFileSync('.env.production.local'));
const password = env.DB_PASSWORD;
const host = env.DB_HOST || 'srv1824.hstgr.io';
const user = env.DB_USER;
const db = env.DB_NAME;

const outFile = fs.createWriteStream('backups/hostinger-production-backup.sql');

const child = spawn('docker', [
  'exec',
  '-i',
  '-e', `MYSQL_PWD=${password}`,
  'intellicore_mysql',
  'mysqldump',
  '-h', host,
  '-P', '3306',
  '-u', user,
  '--ssl-mode=REQUIRED',
  '--column-statistics=0',
  '--single-transaction',
  '--quick',
  db
]);

child.stdout.pipe(outFile);
let errLog = '';
child.stderr.on('data', d => errLog += d.toString());

child.on('close', code => {
  if (code === 0) {
    const size = fs.statSync('backups/hostinger-production-backup.sql').size;
    console.log('✅ Remote Hostinger Database Backup SUCCESSFUL! File size:', (size / 1024).toFixed(2), 'KB');
  } else {
    console.error('❌ Backup failed with code', code, errLog);
    process.exit(1);
  }
});
