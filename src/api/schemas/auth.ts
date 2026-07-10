/**
 * src/api/schemas/auth.ts
 *
 * Zod validation schemas for all authentication-related HTTP payloads.
 *
 * Every API endpoint controller in `src/api/controllers/auth/` must validate
 * incoming request bodies against these schemas before any domain logic runs.
 * This satisfies the code-standards.md requirement:
 *   "All incoming HTTP request payloads must be validated against a strict
 *    compile-time Zod schema before hitting your domain layer."
 */

import { z } from 'zod';

// ---------------------------------------------------------------------------
// Registration
// ---------------------------------------------------------------------------

export const RegisterSchema = z.object({
  email: z
    .string()
    .email({ message: 'A valid email address is required.' })
    .toLowerCase()
    .trim(),
  password: z
    .string()
    .min(8, { message: 'Password must be at least 8 characters.' })
    .max(128, { message: 'Password must not exceed 128 characters.' }),
  currency: z
    .string()
    .length(3, { message: 'Currency must be an ISO 4217 three-letter code (e.g. USD).' })
    .toUpperCase(),
  country: z
    .string()
    .length(2, { message: 'Country must be an ISO 3166-1 alpha-2 code (e.g. US).' })
    .toUpperCase(),
});

export type RegisterInput = z.infer<typeof RegisterSchema>;

// ---------------------------------------------------------------------------
// Login
// ---------------------------------------------------------------------------

export const LoginSchema = z.object({
  email: z
    .string()
    .email({ message: 'A valid email address is required.' })
    .toLowerCase()
    .trim(),
  password: z
    .string()
    .min(1, { message: 'Password is required.' }),
});

export type LoginInput = z.infer<typeof LoginSchema>;

// ---------------------------------------------------------------------------
// OAuth Identity Upsert (used internally by OAuth callback controllers)
// ---------------------------------------------------------------------------

export const OAuthUpsertSchema = z.object({
  provider: z.enum(['google', 'apple']),
  provider_user_id: z.string().min(1),
  email: z
    .string()
    .email()
    .toLowerCase()
    .trim(),
  currency: z
    .string()
    .length(3)
    .toUpperCase()
    .default('USD'),
  country: z
    .string()
    .length(2)
    .toUpperCase()
    .default('US'),
});

export type OAuthUpsertInput = z.infer<typeof OAuthUpsertSchema>;
