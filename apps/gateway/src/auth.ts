import { createHash, timingSafeEqual } from 'node:crypto';
import { jwtVerify, SignJWT } from 'jose';
import { z } from 'zod';
import type { User } from '../../../types.js';
import { GatewayError } from './errors.js';

const userSchema = z.object({ id: z.string().min(1).max(100), groups: z.array(z.string().regex(/^[a-z][a-z0-9-]{0,39}$/)).max(20) }).strict();
export interface ApiIdentity { key: string; user: User; }
export class Auth {
  constructor(private readonly secret: string, private readonly apiKeys: readonly ApiIdentity[] = []) {}
  async authenticate(header?: string): Promise<User> {
    const match = /^Bearer ([^\s]+)$/.exec(header ?? '');
    if (!match) throw new GatewayError('UNAUTHENTICATED', 401);
    const token = match[1]!;
    const digest = createHash('sha256').update(token).digest();
    for (const identity of this.apiKeys) {
      if (timingSafeEqual(digest, createHash('sha256').update(identity.key).digest())) return userSchema.parse(identity.user);
    }
    try {
      const { payload } = await jwtVerify(token, new TextEncoder().encode(this.secret), {
        algorithms: ['HS256'], issuer: 'aevia-gateway', audience: 'aevia-client', requiredClaims: ['sub', 'exp', 'iat'],
      });
      return userSchema.parse({ id: payload.sub, groups: payload.groups });
    } catch { throw new GatewayError('UNAUTHENTICATED', 401); }
  }
}
export async function issueToken(user: User, secret: string, expiresIn = '1h'): Promise<string> {
  userSchema.parse(user);
  return new SignJWT({ groups: user.groups }).setProtectedHeader({ alg: 'HS256', typ: 'JWT' })
    .setSubject(user.id).setIssuedAt().setIssuer('aevia-gateway').setAudience('aevia-client')
    .setExpirationTime(expiresIn).sign(new TextEncoder().encode(secret));
}
