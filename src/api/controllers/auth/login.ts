/**
 * src/api/controllers/auth/login.ts
 *
 * POST /api/auth/login
 *
 * Execution lifecycle (code-standards.md §2):
 *   Schema Validation → User Lookup → bcrypt Verify → Session Create →
 *   Set Cookie → 200 Response
 *
 * Security notes:
 *  - The same generic error message is returned for "user not found" and
 *    "wrong password" to prevent user enumeration.
 *  - bcrypt.compare() is used for constant-time comparison to mitigate
 *    timing attacks.
 *  - Parameterized queries only — no string interpolation.
 */

import { type NextRequest } from 'next/server';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import { LoginSchema } from '@/api/schemas/auth';
import {
  errorResponse,
  generateSessionToken,
  hashSessionToken,
  buildSessionCookieHeader,
  SESSION_TTL_MS,
} from '@/api/middleware/auth';
import { query } from '@/data/db';
import type { UserRecord } from '@/data/types';

// ---------------------------------------------------------------------------
// Generic auth failure message — intentionally identical for both cases
// ---------------------------------------------------------------------------
const INVALID_CREDENTIALS_MSG = 'The email or password is incorrect.';

// ---------------------------------------------------------------------------
// Route Handler
// ---------------------------------------------------------------------------

export async function POST(request: NextRequest): Promise<Response> {
  try {
    // ── 1. Schema Validation ─────────────────────────────────────────────
    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return errorResponse(400, 'BAD_REQUEST', 'Request body must be valid JSON.');
    }

    const parsed = LoginSchema.safeParse(body);
    if (!parsed.success) {
      const issues = parsed.error.issues.map((issue) => ({
        path: issue.path.join('.'),
        message: issue.message,
      }));
      return errorResponse(400, 'BAD_REQUEST_VALIDATION', 'Input validation failed.', issues);
    }

    const { email, password } = parsed.data;

    // ── 2. User Lookup ────────────────────────────────────────────────────
    const userResult = await query<Pick<UserRecord, 'id' | 'email' | 'password_hash' | 'currency' | 'country'>>(
      `SELECT id, email, password_hash, currency, country
         FROM users
        WHERE email = $1
        LIMIT 1`,
      [email]
    );

    const user = userResult.rows[0];

    // ── 3. Credential Verification ────────────────────────────────────────
    // Deliberate: we check password_hash even when user is not found to prevent
    // timing-based enumeration (bcrypt.compare on a dummy hash).
    const DUMMY_HASH = '$2b$12$invalidhashpaddingtomatchbcryptlength00000000000';
    const storedHash = user?.password_hash ?? DUMMY_HASH;

    const passwordMatches = await bcrypt.compare(password, storedHash);

    if (!user || !passwordMatches || !user.password_hash) {
      return errorResponse(401, 'INVALID_CREDENTIALS', INVALID_CREDENTIALS_MSG);
    }

    // ── 4. Create Session ─────────────────────────────────────────────────
    const rawToken = generateSessionToken();
    const tokenHash = hashSessionToken(rawToken);
    const expiresAt = new Date(Date.now() + SESSION_TTL_MS);

    const sessionId = crypto.randomUUID();

    await query(
      `INSERT INTO sessions (id, user_id, token_hash, expires_at)
            VALUES ($1, $2, $3, $4)`,
      [sessionId, user.id, tokenHash, expiresAt.toISOString()]
    );

    // ── 5. Set HttpOnly cookie + return 200 ───────────────────────────────
    const cookieHeader = buildSessionCookieHeader(rawToken, expiresAt);

    const responseBody = JSON.stringify({
      success: true,
      data: {
        id: user.id,
        email: user.email,
        currency: user.currency,
        country: user.country,
      },
    });

    return new Response(responseBody, {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'Set-Cookie': cookieHeader,
      },
    });
  } catch (err: unknown) {
    console.error('[login] Unexpected error:', err instanceof Error ? err.message : err);
    return errorResponse(500, 'INTERNAL_ERROR', 'An unexpected error occurred. Please try again.');
  }
}
