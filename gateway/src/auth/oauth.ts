/**
 * OAuth2 Authorization Server with PKCE (RFC 7636)
 *
 * Implements:
 * - Authorization Code Flow + PKCE
 * - Token endpoint (exchange code for tokens)
 * - Token refresh
 * - Token introspection
 * - JWKS endpoint (public keys for verification)
 * - OpenID Connect UserInfo endpoint
 */

import crypto from 'crypto';
import { createClient } from 'redis';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import { v4 as uuidv4 } from 'uuid';
import { config, oauthClients, scopeDefinitions } from '../config';
import { logger } from '../utils/logger';

// ─── Types ────────────────────────────────────────────────────

export interface User {
  id: string;
  email: string;
  passwordHash: string;
  givenName: string;
  familyName: string;
  roles: string[];
  scopes: string[];
  mfaEnabled: boolean;
  active: boolean;
}

export interface AuthorizationCode {
  code: string;
  clientId: string;
  userId: string;
  redirectUri: string;
  scopes: string[];
  codeChallenge: string;
  codeChallengeMethod: 'S256' | 'plain';
  expiresAt: number;
  used: boolean;
}

export interface TokenPair {
  accessToken: string;
  refreshToken: string;
  tokenType: 'Bearer';
  expiresIn: number;
  scope: string;
}

export interface TokenPayload {
  sub: string;
  email: string;
  given_name: string;
  family_name: string;
  scopes: string[];
  roles: string[];
  iss: string;
  aud: string;
  exp: number;
  iat: number;
  jti: string;
}

// ─── Demo user store (replace with DB in production) ──────────

const DEMO_USERS: User[] = [
  {
    id: 'usr_001',
    email: 'analyst@bankonboard.io',
    passwordHash: bcrypt.hashSync('Password123!', 10),
    givenName: 'Sarah',
    familyName: 'Chen',
    roles: ['analyst'],
    scopes: ['openid', 'profile', 'party:read'],
    mfaEnabled: false,
    active: true,
  },
  {
    id: 'usr_002',
    email: 'manager@bankonboard.io',
    passwordHash: bcrypt.hashSync('Password123!', 10),
    givenName: 'James',
    familyName: 'Okonkwo',
    roles: ['manager'],
    scopes: ['openid', 'profile', 'party:read', 'party:write', 'ai:invoke'],
    mfaEnabled: false,
    active: true,
  },
  {
    id: 'usr_003',
    email: 'admin@bankonboard.io',
    passwordHash: bcrypt.hashSync('Password123!', 10),
    givenName: 'Admin',
    familyName: 'User',
    roles: ['admin'],
    scopes: ['openid', 'profile', 'party:read', 'party:write', 'ai:invoke'],
    mfaEnabled: false,
    active: true,
  },
];

// ─── In-memory stores (use Redis in production) ───────────────

const authCodes = new Map<string, AuthorizationCode>();
const refreshTokens = new Map<string, { userId: string; scopes: string[]; expiresAt: number }>();

// ─── PKCE helpers ─────────────────────────────────────────────

/**
 * Verify PKCE code challenge.
 * RFC 7636: code_challenge = BASE64URL(SHA256(ASCII(code_verifier)))
 */
export function verifyPkce(codeVerifier: string, codeChallenge: string, method: 'S256' | 'plain'): boolean {
  if (method === 'S256') {
    const computed = crypto
      .createHash('sha256')
      .update(codeVerifier)
      .digest('base64')
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=/g, '');
    return crypto.timingSafeEqual(Buffer.from(computed), Buffer.from(codeChallenge));
  }
  // 'plain' — not recommended but supported
  return crypto.timingSafeEqual(Buffer.from(codeVerifier), Buffer.from(codeChallenge));
}

/**
 * Validate code_verifier format per RFC 7636.
 * Must be 43–128 characters, unreserved URI characters only.
 */
export function isValidCodeVerifier(verifier: string): boolean {
  return /^[A-Za-z0-9\-._~]{43,128}$/.test(verifier);
}

// ─── User helpers ─────────────────────────────────────────────

export function findUserByEmail(email: string): User | undefined {
  return DEMO_USERS.find((u) => u.email === email.toLowerCase());
}

export function findUserById(id: string): User | undefined {
  return DEMO_USERS.find((u) => u.id === id);
}

export async function validateCredentials(email: string, password: string): Promise<User | null> {
  const user = findUserByEmail(email);
  if (!user || !user.active) return null;
  const valid = await bcrypt.compare(password, user.passwordHash);
  return valid ? user : null;
}

// ─── Authorization code management ────────────────────────────

export function createAuthorizationCode(params: Omit<AuthorizationCode, 'code' | 'expiresAt' | 'used'>): string {
  const code = crypto.randomBytes(32).toString('hex');
  authCodes.set(code, {
    ...params,
    code,
    expiresAt: Date.now() + 10 * 60 * 1000, // 10 minutes
    used: false,
  });
  // Auto-cleanup after expiry
  setTimeout(() => authCodes.delete(code), 10 * 60 * 1000);
  return code;
}

export function consumeAuthorizationCode(code: string): AuthorizationCode | null {
  const authCode = authCodes.get(code);
  if (!authCode) return null;
  if (authCode.used) return null;
  if (Date.now() > authCode.expiresAt) {
    authCodes.delete(code);
    return null;
  }
  // Mark as used — single use only
  authCode.used = true;
  authCodes.set(code, authCode);
  // Delete after brief window
  setTimeout(() => authCodes.delete(code), 5000);
  return authCode;
}

// ─── Token generation ─────────────────────────────────────────

export function generateAccessToken(user: User, scopes: string[]): string {
  const payload: TokenPayload = {
    sub: user.id,
    email: user.email,
    given_name: user.givenName,
    family_name: user.familyName,
    scopes,
    roles: user.roles,
    iss: config.issuer,
    aud: config.audience,
    exp: Math.floor(Date.now() / 1000) + config.accessTokenTtlMinutes * 60,
    iat: Math.floor(Date.now() / 1000),
    jti: uuidv4(),
  };
  return jwt.sign(payload, config.jwtSecret, { algorithm: 'HS256' });
}

export function generateRefreshToken(userId: string, scopes: string[]): string {
  const token = crypto.randomBytes(48).toString('base64url');
  const expiresAt = Date.now() + config.refreshTokenTtlDays * 24 * 60 * 60 * 1000;
  refreshTokens.set(token, { userId, scopes, expiresAt });
  return token;
}

export function generateTokenPair(user: User, scopes: string[]): TokenPair {
  const accessToken = generateAccessToken(user, scopes);
  const refreshToken = generateRefreshToken(user.id, scopes);
  return {
    accessToken,
    refreshToken,
    tokenType: 'Bearer',
    expiresIn: config.accessTokenTtlMinutes * 60,
    scope: scopes.join(' '),
  };
}

// ─── Token validation ─────────────────────────────────────────

export function verifyAccessToken(token: string): TokenPayload | null {
  try {
    return jwt.verify(token, config.jwtSecret, {
      issuer: config.issuer,
      audience: config.audience,
      algorithms: ['HS256'],
    }) as TokenPayload;
  } catch (err) {
    logger.debug(`Token verification failed: ${(err as Error).message}`);
    return null;
  }
}

export function consumeRefreshToken(token: string): { userId: string; scopes: string[] } | null {
  const stored = refreshTokens.get(token);
  if (!stored) return null;
  if (Date.now() > stored.expiresAt) {
    refreshTokens.delete(token);
    return null;
  }
  // Refresh token rotation — invalidate old, issue new
  refreshTokens.delete(token);
  return { userId: stored.userId, scopes: stored.scopes };
}

// ─── Scope intersection ───────────────────────────────────────

export function intersectScopes(requested: string[], allowed: string[]): string[] {
  return requested.filter((s) => allowed.includes(s));
}
