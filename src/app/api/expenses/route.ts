/**
 * src/app/api/expenses/route.ts
 *
 * Manual Quick-Add Transaction Endpoint.
 *
 * Enforces:
 *  - Authentication Boundary: Validates session via `verifySession`.
 *  - Zod Payload Validation: Ensures request matches `ExpenseInputSchema`.
 *  - Parameterized Data Isolation: Injects `user_id` into the INSERT query.
 */

import { type NextRequest } from 'next/server';
import { verifySession, errorResponse, successResponse } from '@/api/middleware/auth';
import { ExpenseInputSchema } from '@/api/schemas/expenses';
import { query } from '@/data/db';
import type { ExpenseRecord } from '@/data/types';
import crypto from 'crypto';

export async function POST(request: NextRequest) {
  try {
    // 1. Authentication Boundary
    const session = await verifySession(request);

    // 2. Parse Body
    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return errorResponse(400, 'BAD_REQUEST', 'Invalid JSON payload');
    }

    // 3. Schema Validation
    const parseResult = ExpenseInputSchema.safeParse(body);
    if (!parseResult.success) {
      const issues = parseResult.error.issues.map((issue) => ({
        path: issue.path.join('.'),
        message: issue.message,
      }));
      return errorResponse(400, 'BAD_REQUEST_VALIDATION', 'Payload validation failed', issues);
    }

    const data = parseResult.data;

    // 4. Database Insertion (Parameterized Data Isolation)
    const result = await query<ExpenseRecord>(
      `INSERT INTO expenses (id, user_id, amount, currency, category, date, description)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING *`,
      [
        crypto.randomUUID(),
        session.userId,
        data.amount,
        data.currency,
        data.category,
        data.date,
        data.description,
      ]
    );

    const insertedRecord = result.rows[0];

    if (!insertedRecord) {
      throw new Error('Database failed to return the inserted record');
    }

    // 5. Respond with canonical success payload
    return successResponse<ExpenseRecord>(insertedRecord, 201);
  } catch (err: unknown) {
    // Catch standard HTTP error throws from verifySession or other unexpected errors
    if (typeof err === 'object' && err !== null && 'status' in err && 'code' in err && 'message' in err) {
      const typedErr = err as { status: number; code: string; message: string };
      return errorResponse(typedErr.status, typedErr.code, typedErr.message);
    }
    
    console.error('[POST /api/expenses] Internal Server Error:', err);
    return errorResponse(500, 'INTERNAL_SERVER_ERROR', 'An unexpected error occurred');
  }
}
