/**
 * src/api/schemas/expenses.ts
 *
 * Zod schemas for the expenses API boundary.
 * These are the single source of truth for validation before
 * any data touches the database.
 */

import { z } from 'zod';

export const ExpenseInputSchema = z.object({
  amount: z.number().positive({ message: "Amount must be a positive integer or float" }),
  currency: z.string().length(3, { message: "Currency must be a 3-letter ISO code" }),
  category: z.string().min(1, {
    message: "Category is required"
  }),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, { message: "Format must be YYYY-MM-DD" }),
  description: z.string().max(255).trim(),
});

export type ExpenseInput = z.infer<typeof ExpenseInputSchema>;
