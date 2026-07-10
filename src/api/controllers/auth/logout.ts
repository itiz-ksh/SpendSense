/**
 * src/api/controllers/auth/logout.ts
 *
 * POST /api/auth/logout
 *
 * Execution lifecycle:
 *   Session Verification → Session Row Delete → Clear Cookie → 200 Response
 *
 * Security notes:
 *  - Session row is deleted from the DB so the token hash can never be reused,
 *    even if an attacker captures the cookie before it expires client-side.
 *  - Returns 200 (not 401) if called without a valid session — idempotent
 *    logout UX is preferred over error noise.
 */

import { type NextRequest } from 'next/server';
import {
  verifySession,
  errorResponse,
  successResponse,
  buildClearSessionCookieHeader,
  SESSION_COOKIE_NAME,
  hashSessionToken,
} from '@/api/middleware/auth';
import { query } from '@/data/db';

// ---------------------------------------------------------------------------
// Route Handler
// ---------------------------------------------------------------------------

export async function POST(request: NextRequest): Promise<Response> {
  try {
    // ── 1. Verify session (graceful on missing cookie) ───────────────────
    let sessionId: string;
    try {
      const session = await verifySession(request);
      sessionId = session.sessionId;
    } catch {
      // Already logged out or no session — clear cookie idempotently.
      const clearCookie = buildClearSessionCookieHeader();
      return new Response(
        JSON.stringify({ success: true, data: { message: 'Already logged out.' } }),
        {
          status: 200,
          headers: {
            'Content-Type': 'application/json',
            'Set-Cookie': clearCookie,
          },
        }
      );
    }

    // ── 2. Delete Session Row ─────────────────────────────────────────────
    // We re-hash the raw cookie token to ensure the correct row is deleted.
    // The session ID from verifySession is used as an additional safeguard.
    const rawToken = request.cookies.get(SESSION_COOKIE_NAME)?.value ?? '';
    const tokenHash = hashSessionToken(rawToken);

    await query(
      'DELETE FROM sessions WHERE id = $1 AND token_hash = $2',
      [sessionId, tokenHash]
    );

    // ── 3. Clear Cookie + Return 200 ──────────────────────────────────────
    const clearCookie = buildClearSessionCookieHeader();

    return new Response(
      JSON.stringify({ success: true, data: { message: 'Logged out successfully.' } }),
      {
        status: 200,
        headers: {
          'Content-Type': 'application/json',
          'Set-Cookie': clearCookie,
        },
      }
    );
  } catch (err: unknown) {
    console.error('[logout] Unexpected error:', err instanceof Error ? err.message : err);
    return errorResponse(500, 'INTERNAL_ERROR', 'An unexpected error occurred.');
  }
}
