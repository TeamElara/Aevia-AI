import 'dotenv/config';
import { issueToken } from '../src/auth.js';

const users: Record<string, string[]> = { asha: ['employee'], ravi: ['employee', 'hr'], meera: ['employee', 'engineering'], ceo: ['employee', 'admin-exec'], admin: ['admin'] };
const name = process.argv[2];
const secret = process.env.JWT_SECRET;
if (!name || !users[name] || !secret || secret.length < 32) {
  process.stderr.write('Usage: npm run token -- asha|ravi|meera|ceo|admin (requires JWT_SECRET in .env).\n');
  process.exitCode = 1;
} else { process.stdout.write(`${await issueToken({ id: name, groups: users[name] }, secret)}\n`); }
