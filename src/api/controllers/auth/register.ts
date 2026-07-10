/**
 * src/api/controllers/auth/register.ts
 *
 * POST /api/auth/register
 *
 * Execution lifecycle (code-standards.md §2):
 *   Schema Validation → Duplicate Check → Password Hash → User Insert →
 *   Session Create → Set Cookie → 201 Response
 *
 * Architectural invariants upheld:
 *  - Parameterized Data Isolation: all SQL uses $N placeholders.
 *  - No `any` usage; all types are explicit.
 *  - Password is bcrypt-hashed before storage (never stored in plaintext).
 *  - Raw session token lives only in the HttpOnly cookie; hash goes to DB.
 */

import { type NextRequest } from 'next/server';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import { RegisterSchema } from '@/api/schemas/auth';
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
// bcrypt cost factor — 12 rounds is the recommended minimum for 2024+
// ---------------------------------------------------------------------------
const BCRYPT_ROUNDS = 12;

// ---------------------------------------------------------------------------
// Route Handler — consumed by src/app/api/auth/register/route.ts
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

    const parsed = RegisterSchema.safeParse(body);
    if (!parsed.success) {
      const issues = parsed.error.issues.map((issue) => ({
        path: issue.path.join('.'),
        message: issue.message,
      }));
      return errorResponse(400, 'BAD_REQUEST_VALIDATION', 'Input validation failed.', issues);
    }

    const { email, password, currency, country } = parsed.data;

    // ── 2. Duplicate Email Check ──────────────────────────────────────────
    const existing = await query<{ id: string }>(
      'SELECT id FROM users WHERE email = $1 LIMIT 1',
      [email]
    );

    if (existing.rows.length > 0) {
      return errorResponse(
        409,
        'CONFLICT_EMAIL',
        'An account with this email address already exists.'
      );
    }

    // ── 3. Hash Password ──────────────────────────────────────────────────
    const password_hash = await bcrypt.hash(password, BCRYPT_ROUNDS);

    // ── 4. Create User Row ────────────────────────────────────────────────
    const userId = crypto.randomUUID();
    const userResult = await query<Pick<UserRecord, 'id' | 'email' | 'currency' | 'country'>>(
      `INSERT INTO users (id, email, password_hash, currency, country)
            VALUES ($1, $2, $3, $4, $5)
       RETURNING id, email, currency, country`,
      [userId, email, password_hash, currency, country]
    );

    const user = userResult.rows[0];

    // ── 5. Create Session ─────────────────────────────────────────────────
    const rawToken = generateSessionToken();
    const tokenHash = hashSessionToken(rawToken);
    const expiresAt = new Date(Date.now() + SESSION_TTL_MS);
    const sessionId = crypto.randomUUID();

    await query(
      `INSERT INTO sessions (id, user_id, token_hash, expires_at)
            VALUES ($1, $2, $3, $4)`,
      [sessionId, user.id, tokenHash, expiresAt]
    );

    // ── 6. Set HttpOnly cookie + return 201 ───────────────────────────────
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
      status: 201,
      headers: {
        'Content-Type': 'application/json',
        'Set-Cookie': cookieHeader,
      },
    });
  } catch (err: unknown) {
    console.error('[register] Unexpected error:', err instanceof Error ? err.message : err);
    return errorResponse(500, 'INTERNAL_ERROR', 'An unexpected error occurred. Please try again.');
  }
}
