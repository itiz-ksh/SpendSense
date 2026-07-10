/**
 * src/api/middleware/auth.ts
 *
 * Authentication boundary middleware for SpendSense Next.js Route Handlers.
 *
 * Responsibilities:
 *  1. `verifySession(request)` — reads the HttpOnly session cookie, looks up the
 *     hashed token in the sessions table, and returns the validated `user_id`.
 *     Any dashboard or mutation route handler calls this first.
 *
 *  2. `errorResponse(...)` — emits the canonical error JSON shape defined in
 *     code-standards.md so the Geist UI can process failures uniformly.
 *
 *  3. `successResponse(...)` — wraps data in the canonical success envelope.
 *
 * Invariants upheld:
 *  - Parameterized Data Isolation: every session lookup uses a hashed token
 *    parameter — never an interpolated string.
 *  - No raw token values are stored in the database; only SHA-256 hashes.
 *  - Expired sessions are rejected even if the token hash matches.
 */

import { type NextRequest } from 'next/server';
import { cookies } from 'next/headers';
import { createHash } from 'crypto';
import { query } from '@/data/db';
import type { SessionRecord } from '@/data/types';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Name of the HttpOnly cookie that holds the raw session token. */
export const SESSION_COOKIE_NAME = 'spendsense_session';

/** Session lifetime in milliseconds (30 days). */
export const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;

// ---------------------------------------------------------------------------
// Token utilities
// ---------------------------------------------------------------------------

/**
 * Generate a cryptographically random 48-byte session token (URL-safe base64).
 * The raw token is sent to the client; its SHA-256 hash is stored in the DB.
 */
export function generateSessionToken(): string {
  const { randomBytes } = require('crypto') as typeof import('crypto');
  return randomBytes(48).toString('base64url');
}

/**
 * Derive the SHA-256 hash of a raw session token for database storage.
 */
export function hashSessionToken(rawToken: string): string {
  return createHash('sha256').update(rawToken).digest('hex');
}

// ---------------------------------------------------------------------------
// Session verification
// ---------------------------------------------------------------------------

export interface VerifiedSession {
  userId: string;
  sessionId: string;
}

/**
 * Verify the incoming request's session cookie and return the authenticated
 * `userId`. Throws a typed error object if the session is absent, invalid,
 * or expired — callers must catch and return `errorResponse(...)`.
 *
 * @throws `{ status: 401, code: 'UNAUTHORIZED', message: string }`
 */
export async function verifySession(
  request: NextRequest
): Promise<VerifiedSession> {
  const rawToken = request.cookies.get(SESSION_COOKIE_NAME)?.value ?? null;

  if (!rawToken) {
    throw { status: 401, code: 'UNAUTHORIZED', message: 'No session cookie provided.' };
  }

  const tokenHash = hashSessionToken(rawToken);

  // Parameterized query — never interpolated (Parameterized Data Isolation Invariant)
  const result = await query<SessionRecord>(
    `SELECT id, user_id, expires_at
       FROM sessions
      WHERE token_hash = $1
      LIMIT 1`,
    [tokenHash]
  );

  const session = result.rows[0];

  if (!session) {
    throw { status: 401, code: 'UNAUTHORIZED', message: 'Session not found or already revoked.' };
  }

  if (new Date(session.expires_at) < new Date()) {
    // Eagerly clean up the expired row — fire-and-forget is acceptable here.
    void query('DELETE FROM sessions WHERE id = $1', [session.id]);
    throw { status: 401, code: 'UNAUTHORIZED', message: 'Session has expired. Please log in again.' };
  }

  return { userId: session.user_id, sessionId: session.id };
}

/**
 * Get the verified session for Server Components using `next/headers`.
 * Returns null if the session is absent, invalid, or expired.
 */
export async function getServerSession(): Promise<VerifiedSession | null> {
  const cookieStore = await cookies();
  const rawToken = cookieStore.get(SESSION_COOKIE_NAME)?.value ?? null;

  if (!rawToken) {
    return null;
  }

  const tokenHash = hashSessionToken(rawToken);

  const result = await query<SessionRecord>(
    `SELECT id, user_id, expires_at
       FROM sessions
      WHERE token_hash = $1
      LIMIT 1`,
    [tokenHash]
  );

  const session = result.rows[0];

  if (!session) {
    return null;
  }

  if (new Date(session.expires_at) < new Date()) {
    void query('DELETE FROM sessions WHERE id = $1', [session.id]);
    return null;
  }

  return { userId: session.user_id, sessionId: session.id };
}

// ---------------------------------------------------------------------------
// Canonical response factories (code-standards.md §2 Unified Error Handler)
// ---------------------------------------------------------------------------

export interface ApiErrorIssue {
  path: string;
  message: string;
}

interface ApiErrorBody {
  success: false;
  error: {
    code: string;
    message: string;
    issues?: ApiErrorIssue[];
  };
}

interface ApiSuccessBody<T> {
  success: true;
  data: T;
}

/**
 * Return a standardised JSON error response.
 *
 * @param status  - HTTP status code (400, 401, 409, 500, …)
 * @param code    - Machine-readable error code string (e.g. 'BAD_REQUEST_VALIDATION')
 * @param message - Human-readable summary
 * @param issues  - Optional field-level validation issues (from Zod)
 */
export function errorResponse(
  status: number,
  code: string,
  message: string,
  issues?: ApiErrorIssue[]
): Response {
  const body: ApiErrorBody = {
    success: false,
    error: { code, message, ...(issues ? { issues } : {}) },
  };
  return Response.json(body, { status });
}

/**
 * Return a standardised JSON success response.
 *
 * @param data    - Payload to include under the `data` key
 * @param status  - HTTP status code (default 200)
 */
export function successResponse<T>(data: T, status: number = 200): Response {
  const body: ApiSuccessBody<T> = { success: true, data };
  return Response.json(body, { status });
}

// ---------------------------------------------------------------------------
// Cookie builder
// ---------------------------------------------------------------------------

/**
 * Build the Set-Cookie header value for a session token.
 * Uses HttpOnly + SameSite=Lax + Secure (in production) to prevent XSS theft.
 */
export function buildSessionCookieHeader(
  rawToken: string,
  expiresAt: Date
): string {
  const isProduction = process.env.NODE_ENV === 'production';
  const expires = expiresAt.toUTCString();
  return [
    `${SESSION_COOKIE_NAME}=${rawToken}`,
    `Expires=${expires}`,
    'HttpOnly',
    'SameSite=Lax',
    'Path=/',
    isProduction ? 'Secure' : '',
  ]
    .filter(Boolean)
    .join('; ');
}

/**
 * Build the Set-Cookie header value that clears the session cookie.
 * Used by the logout controller.
 */
export function buildClearSessionCookieHeader(): string {
  return [
    `${SESSION_COOKIE_NAME}=`,
    'Expires=Thu, 01 Jan 1970 00:00:00 GMT',
    'HttpOnly',
    'SameSite=Lax',
    'Path=/',
  ].join('; ');
}
