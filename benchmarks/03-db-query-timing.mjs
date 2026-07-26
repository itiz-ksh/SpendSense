/**
 * benchmarks/03-db-query-timing.mjs
 *
 * Benchmark: Database query timing for common queries
 * ────────────────────────────────────────────────────
 * Wraps every DB call with performance.now() to measure the average query
 * time for the two most frequent queries:
 *   1. List all expenses for a user (SELECT … ORDER BY date DESC)
 *   2. Monthly summary (GROUP BY STRFTIME)
 *
 * Inserts 5,000 realistic rows first so the query planner has meaningful data.
 *
 * Usage:  node benchmarks/03-db-query-timing.mjs
 */

import Database from 'better-sqlite3';
import path from 'path';
import { fileURLToPath } from 'url';
import { randomUUID } from 'crypto';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dbPath    = path.join(__dirname, '..', 'spendsense.db');

const SEED_ROWS  = 5_000;
const ITERATIONS = 200;   // how many times to run each SELECT

// ── Helpers ──────────────────────────────────────────────────────────────────

function hr(label) {
  console.log(`\n${'─'.repeat(60)}`);
  console.log(`  ${label}`);
  console.log('─'.repeat(60));
}

function percentile(sorted, p) {
  return sorted[Math.floor(sorted.length * p)];
}

function report(label, times) {
  const sorted = [...times].sort((a, b) => a - b);
  const mean   = times.reduce((s, v) => s + v, 0) / times.length;
  console.log(`\n  ${label}`);
  console.log(`    mean : ${mean.toFixed(3)} ms`);
  console.log(`    min  : ${sorted[0].toFixed(3)} ms`);
  console.log(`    p50  : ${percentile(sorted, 0.50).toFixed(3)} ms`);
  console.log(`    p95  : ${percentile(sorted, 0.95).toFixed(3)} ms`);
  console.log(`    p99  : ${percentile(sorted, 0.99).toFixed(3)} ms`);
  console.log(`    max  : ${sorted[sorted.length - 1].toFixed(3)} ms`);
}

const CATEGORIES = ['Food', 'Rent', 'Entertainment', 'Others', 'Travel', 'Health'];
const MONTHS     = ['2024-01', '2024-02', '2024-03', '2024-04', '2024-05', '2024-06',
                    '2024-07', '2024-08', '2024-09', '2024-10', '2024-11', '2024-12'];

// ── Setup ─────────────────────────────────────────────────────────────────────

const db = new Database(dbPath);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

const benchUserId = `bench-query-${Date.now()}`;
db.prepare(
  `INSERT OR IGNORE INTO users (id, email, password_hash, currency, country)
   VALUES (?, ?, ?, ?, ?)`
).run(benchUserId, `bench-query-${Date.now()}@test.invalid`, 'x', 'USD', 'US');

// ── Seed data ─────────────────────────────────────────────────────────────────
hr(`Seeding ${SEED_ROWS.toLocaleString()} benchmark rows…`);

const insertStmt = db.prepare(
  `INSERT INTO expenses (id, user_id, amount, currency, category, date, description)
   VALUES (?, ?, ?, ?, ?, ?, ?)`
);

const seedBatch = db.transaction((n) => {
  for (let i = 0; i < n; i++) {
    const month = MONTHS[i % MONTHS.length];
    const day   = String((i % 28) + 1).padStart(2, '0');
    insertStmt.run(
      randomUUID(),
      benchUserId,
      (Math.random() * 1000 + 1).toFixed(2),
      'USD',
      CATEGORIES[i % CATEGORIES.length],
      `${month}-${day}`,
      `Seeded expense ${i}`
    );
  }
});

const seedStart = performance.now();
seedBatch(SEED_ROWS);
console.log(`  Seeded ${SEED_ROWS.toLocaleString()} rows in ${(performance.now() - seedStart).toFixed(0)} ms`);

// ── Query 1: List all transactions ────────────────────────────────────────────
hr(`Query 1: List all transactions for a user (${ITERATIONS} iterations)`);

const listStmt = db.prepare(
  `SELECT id, user_id, amount, currency, category, date, description, created_at, updated_at
     FROM expenses
    WHERE user_id = ?
 ORDER BY date DESC, created_at DESC`
);

const listTimes = [];
for (let i = 0; i < ITERATIONS; i++) {
  const t0  = performance.now();
  const rows = listStmt.all(benchUserId);
  const t1  = performance.now();
  listTimes.push(t1 - t0);
  if (i === 0) console.log(`  Row count: ${rows.length}`);
}
report('SELECT all expenses ORDER BY date DESC', listTimes);

// ── Query 2: Monthly summary (GROUP BY) ───────────────────────────────────────
hr(`Query 2: Monthly summary / GROUP BY (${ITERATIONS} iterations)`);

const summaryStmt = db.prepare(
  `SELECT
     STRFTIME('%Y-%m', date)   AS month,
     category,
     COUNT(*)                  AS txn_count,
     SUM(amount)               AS total,
     AVG(amount)               AS avg_amount
   FROM expenses
  WHERE user_id = ?
  GROUP BY month, category
  ORDER BY month DESC`
);

const summaryTimes = [];
for (let i = 0; i < ITERATIONS; i++) {
  const t0   = performance.now();
  const rows  = summaryStmt.all(benchUserId);
  const t1   = performance.now();
  summaryTimes.push(t1 - t0);
  if (i === 0) console.log(`  Result groups: ${rows.length}`);
}
report('SELECT monthly summary GROUP BY month,category', summaryTimes);

// ── Query 3: Session lookup (hot path, runs on every auth'd request) ──────────
hr(`Query 3: Session token lookup (${ITERATIONS} iterations, hot auth path)`);

// Insert a dummy session
const fakeToken = 'a'.repeat(64);
const sessionId = randomUUID();
db.prepare(
  `INSERT OR IGNORE INTO sessions (id, user_id, token_hash, expires_at)
   VALUES (?, ?, ?, ?)`
).run(sessionId, benchUserId, fakeToken, new Date(Date.now() + 86400000).toISOString());

const sessionStmt = db.prepare(
  `SELECT id, user_id, expires_at
     FROM sessions
    WHERE token_hash = ?
    LIMIT 1`
);

const sessionTimes = [];
for (let i = 0; i < ITERATIONS; i++) {
  const t0 = performance.now();
  sessionStmt.get(fakeToken);
  const t1 = performance.now();
  sessionTimes.push(t1 - t0);
}
report('SELECT session WHERE token_hash = ? LIMIT 1', sessionTimes);

// ── Cleanup ───────────────────────────────────────────────────────────────────
hr('Cleanup');
db.prepare(`DELETE FROM expenses WHERE user_id = ?`).run(benchUserId);
db.prepare(`DELETE FROM sessions WHERE user_id = ?`).run(benchUserId);
db.prepare(`DELETE FROM users WHERE id = ?`).run(benchUserId);
db.close();

console.log('\n✅  DB query timing benchmark complete.\n');
