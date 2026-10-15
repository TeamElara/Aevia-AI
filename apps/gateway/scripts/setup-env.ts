import { randomBytes } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';

const sample = readFileSync('.env.example', 'utf8')
  .replace('JWT_SECRET=GENERATE_ME', `JWT_SECRET=${randomBytes(32).toString('hex')}`)
  .replace('AUDIT_HMAC_SECRET=GENERATE_ME', `AUDIT_HMAC_SECRET=${randomBytes(32).toString('hex')}`);
try { writeFileSync('.env', sample, { flag: 'wx', mode: 0o600 }); process.stdout.write('Created .env with independent local secrets. Set your provider model and key.\n'); }
catch { process.stderr.write('.env already exists or cannot be written; nothing was overwritten.\n'); process.exitCode = 1; }
