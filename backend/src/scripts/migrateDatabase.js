import { spawnSync } from 'node:child_process';

function validateTarget() {
  const url = new URL(process.env.DATABASE_URL);
  if (!process.env.SHADOW_DATABASE_URL) {
    const defaultShadow = new URL(url);
    defaultShadow.pathname = '/intellicore_shadow_db';
    process.env.SHADOW_DATABASE_URL = defaultShadow.href;
  }
  const shadow = new URL(process.env.SHADOW_DATABASE_URL);
  const user = decodeURIComponent(url.username);
  if (process.env.NODE_ENV === 'production' || url.protocol !== 'mysql:' || shadow.protocol !== 'mysql:'
      || url.hostname !== 'mysql' || !url.password || !shadow.password || shadow.hostname !== url.hostname
      || shadow.username !== url.username || url.pathname === shadow.pathname
      || !/^intellicore_migration(?:_[a-z0-9]+)?$/i.test(user)
      || url.pathname !== '/' + process.env.MYSQL_DATABASE) throw new Error('Invalid migration target.');
}

try {
  validateTarget();
  const [action = 'deploy', ...extra] = process.argv.slice(2);
  const commands = { deploy: ['deploy'], status: ['status'], 'resolve-phase05': ['resolve', '--rolled-back',
    '20261125000000_add_attendance_leave_and_reports'] };
  if (extra.length || !Object.hasOwn(commands, action)) throw new Error('Unsupported maintenance action.');
  const result = spawnSync(process.execPath, ['node_modules/prisma/build/index.js', 'migrate', ...commands[action]],
    { stdio: 'inherit' });
  process.exitCode = result.status ?? 1;
} catch {
  console.error('Configure the dedicated development migration and shadow database URLs before running maintenance.');
  process.exitCode = 1;
}
