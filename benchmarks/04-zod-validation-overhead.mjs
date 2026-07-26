/**
 * benchmarks/04-zod-validation-overhead.mjs
 *
 * Benchmark: Zod validation overhead on the hot API route
 * ────────────────────────────────────────────────────────
 * Measures added microseconds from ExpenseInputSchema.safeParse() by running
 * the validation against a valid payload and an invalid payload, comparing
 * with/without the parse step.
 *
 * Usage:  node benchmarks/04-zod-validation-overhead.mjs
 */

import { z } from 'zod';

// ── Helpers ──────────────────────────────────────────────────────────────────

function hr(label) {
  console.log(`\n${'─'.repeat(60)}`);
  console.log(`  ${label}`);
  console.log('─'.repeat(60));
}

function stats(times) {
  const sorted = [...times].sort((a, b) => a - b);
  const sum    = times.reduce((s, v) => s + v, 0);
  return {
    mean: (sum / times.length).toFixed(2) + ' µs',
    min:  sorted[0].toFixed(2) + ' µs',
    p50:  sorted[Math.floor(sorted.length * 0.50)].toFixed(2) + ' µs',
    p95:  sorted[Math.floor(sorted.length * 0.95)].toFixed(2) + ' µs',
    p99:  sorted[Math.floor(sorted.length * 0.99)].toFixed(2) + ' µs',
    max:  sorted[sorted.length - 1].toFixed(2) + ' µs',
  };
}

// ── Replicate the production schema exactly ───────────────────────────────────

const ExpenseInputSchema = z.object({
  amount:      z.number().positive({ message: 'Amount must be a positive integer or float' }),
  currency:    z.string().length(3, { message: 'Currency must be a 3-letter ISO code' }),
  category:    z.string().min(1, { message: 'Category is required' }),
  date:        z.string().regex(/^\d{4}-\d{2}-\d{2}$/, { message: 'Format must be YYYY-MM-DD' }),
  description: z.string().max(255).trim(),
});

const RegisterSchema = z.object({
  email:    z.string().email(),
  password: z.string().min(8).max(128),
  currency: z.string().length(3),
  country:  z.string().length(2),
});

// ── Test payloads ─────────────────────────────────────────────────────────────

const VALID_EXPENSE = {
  amount:      49.99,
  currency:    'USD',
  category:    'Food',
  date:        '2024-07-15',
  description: 'Lunch at Chipotle',
};

const INVALID_EXPENSE = {
  amount:      -5,           // fails: not positive
  currency:    'USDD',       // fails: length 4 ≠ 3
  category:    '',           // fails: empty
  date:        '15-07-2024', // fails: regex
  description: 'x'.repeat(300), // fails: max 255
};

const VALID_REGISTER = {
  email:    'user@example.com',
  password: 'Str0ngPass!',
  currency: 'USD',
  country:  'US',
};

// ── Benchmark function ────────────────────────────────────────────────────────

const ITERATIONS = 50_000;

function benchParse(label, schema, payload) {
  // Warm-up
  for (let i = 0; i < 1000; i++) schema.safeParse(payload);

  const times = [];
  for (let i = 0; i < ITERATIONS; i++) {
    const t0 = performance.now();
    schema.safeParse(payload);
    const t1 = performance.now();
    times.push((t1 - t0) * 1000); // convert ms → µs
  }
  return { label, ...stats(times) };
}

function benchNoOp(label, payload) {
  // Baseline: just access the object keys with no validation
  const times = [];
  for (let i = 0; i < ITERATIONS; i++) {
    const t0 = performance.now();
    // Simulate route handler reading fields without Zod
    void payload.amount;
    void payload.currency;
    void payload.category;
    void payload.date;
    void payload.description;
    const t1 = performance.now();
    times.push((t1 - t0) * 1000);
  }
  return { label, ...stats(times) };
}

// ── Run benchmarks ────────────────────────────────────────────────────────────

hr(`Setup — ${ITERATIONS.toLocaleString()} iterations each`);
console.log('  Schemas: ExpenseInputSchema, RegisterSchema');
console.log('  Comparing: with Zod vs. bare property access (no validation)\n');

const results = [];

hr('ExpenseInputSchema — valid payload');
results.push(benchParse('Zod ExpenseInput (valid)', ExpenseInputSchema, VALID_EXPENSE));
console.table(results.at(-1));

hr('ExpenseInputSchema — invalid payload (all 5 fields fail)');
results.push(benchParse('Zod ExpenseInput (invalid, 5 errors)', ExpenseInputSchema, INVALID_EXPENSE));
console.table(results.at(-1));

hr('RegisterSchema — valid payload');
results.push(benchParse('Zod RegisterSchema (valid)', RegisterSchema, VALID_REGISTER));
console.table(results.at(-1));

hr('Baseline — bare property access (no Zod)');
results.push(benchNoOp('No Zod (raw property reads)', VALID_EXPENSE));
console.table(results.at(-1));

// ── Summary ───────────────────────────────────────────────────────────────────
hr('Summary (mean latency in microseconds)');
console.table(results.map(r => ({ Label: r.label, 'Mean (µs)': r.mean, 'p99 (µs)': r.p99 })));

// Calculate overhead
const baselineMean  = parseFloat(results.find(r => r.label.startsWith('No Zod')).mean);
const expenseValid  = parseFloat(results.find(r => r.label.includes('valid') && r.label.includes('Expense')).mean);
const zodOverhead   = expenseValid - baselineMean;

console.log(`\nZod overhead on ExpenseInputSchema (valid): ${zodOverhead.toFixed(2)} µs added per request`);
console.log(`That is ${(zodOverhead / 1000).toFixed(4)} ms — negligible vs. p99 DB query time (see benchmark 03).`);
console.log('\n✅  Zod validation overhead benchmark complete.\n');
