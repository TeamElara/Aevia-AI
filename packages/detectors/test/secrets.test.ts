import { describe, expect, it } from 'vitest';
import { detectAll, detectSplitSecrets } from '../src';
import { fake } from './fixtures';

const ctx = { source: 'prompt' as const };
const secretsIn = (text: string) => detectAll(text, ctx).filter((f) => f.category === 'SECRET' || f.category === 'PRIVATE_KEY');

describe('secrets', () => {
  it.each(Object.entries(fake))('finds %s keys', (_name, make) => {
    const key = make();
    const text = `here is my key ${key} thanks`;
    const [f] = secretsIn(text);
    expect(f).toBeDefined();
    expect(text.slice(f.start, f.end)).toBe(key);
  });

  it('finds a PEM private key', () => {
    const pem = '-----BEGIN RSA PRIVATE KEY-----\nMIIEow' + 'A'.repeat(40) + '\n-----END RSA PRIVATE KEY-----';
    expect(secretsIn(pem)[0].category).toBe('PRIVATE_KEY');
  });

  it('marks only the password inside a DB URI', () => {
    const text = 'mongodb://admin:S3cr3tPass@db.internal:27017/app';
    const [f] = secretsIn(text);
    expect(text.slice(f.start, f.end)).toBe('S3cr3tPass');
  });

  it('finds password assignments and Hinglish phrasing', () => {
    expect(secretsIn('password: Hunter2!x')).toHaveLength(1);
    expect(secretsIn('mera password hai Rahul@123')).toHaveLength(1);
  });

  it('ignores code identifiers and placeholders', () => {
    expect(secretsIn('const password = getPassword();')).toHaveLength(0);
    expect(secretsIn('password = process.env.DB_PASS')).toHaveLength(0);
    expect(secretsIn('password: ********')).toHaveLength(0);
  });
});

describe('split secrets across messages', () => {
  it('finds a key pasted in two halves', () => {
    const key = fake.awsAccess();
    const msgs = ['hello', `my key starts ${key.slice(0, 9)}`, `${key.slice(9)} and that's it`];
    const [f] = detectSplitSecrets(msgs);
    expect(f.messageIndexes).toEqual([1, 2]);
    expect(f.ruleId).toBe('secret.aws_access_key.split');
  });

  it('does not report a key that sits whole in one message', () => {
    expect(detectSplitSecrets(['a', `key ${fake.awsAccess()}`, 'b'])).toHaveLength(0);
  });
});
