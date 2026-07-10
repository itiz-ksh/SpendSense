/**
 * src/data/expenses.ts
 *
 * Data access layer for expenses.
 */

import { query } from './db';
import type { ExpenseRecord } from './types';

/**
 * Fetch all expenses for a specific user, ordered chronologically (newest first).
 * Enforces parameterized Data Isolation.
 */
export async function getExpensesByUserId(userId: string): Promise<ExpenseRecord[]> {
  const result = await query<ExpenseRecord>(
    `SELECT id, user_id, amount, currency, category, date, description, created_at, updated_at
       FROM expenses
      WHERE user_id = $1
   ORDER BY date DESC, created_at DESC`,
    [userId]
  );
  return result.rows;
}

/**
 * Fetch only the created_at timestamp for a user.
 * Used by the Spending Heatmap to compute the dynamic account lifespan timeline.
 * Enforces parameterized Data Isolation — never interpolates userId.
 */
export async function getUserCreatedAt(userId: string): Promise<string | null> {
  const result = await query<{ created_at: string }>(
    `SELECT created_at FROM users WHERE id = $1 LIMIT 1`,
    [userId]
  );
  return result.rows[0]?.created_at ?? null;
}
