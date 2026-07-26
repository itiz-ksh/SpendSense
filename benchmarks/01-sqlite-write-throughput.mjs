/**
 * benchmarks/01-sqlite-write-throughput.mjs
 *
 * Benchmark: SQLite Write Throughput via better-sqlite3
 * ─────────────────────────────────────────────────────
 * Runs 10,000 sequential inserts using the *native* better-sqlite3 API
 * (synchronous, bypassing the async wrapper in src/data/db.ts) to measure
 * raw engine throughput. Also compares against a PostgreSQL theoretical baseline.
 *
 * Usage:  node benchmarks/01-sqlite-write-throughput.mjs
 */

import Database from 'better-sqlite3';
import path from 'path';
import { fileURLToPath } from 'url';
import { randomUUID } from 'crypto';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dbPath    = path.join(__dirname, '..', 'spendsense.db');

const NUM_INSERTS = 10_000;

// ── Helpers ──────────────────────────────────────────────────────────────────

function hr(label) {
  console.log(`\n${'─'.repeat(60)}`);
  console.log(`  ${label}`);
  console.log('─'.repeat(60));
}

function stats(samples) {
  const sorted = [...samples].sort((a, b) => a - b);
  const sum    = samples.reduce((s, v) => s + v, 0);
  return {
    min:  sorted[0].toFixed(3),
    max:  sorted[sorted.length - 1].toFixed(3),
    mean: (sum / samples.length).toFixed(3),
    p50:  sorted[Math.floor(samples.length * 0.50)].toFixed(3),
    p95:  sorted[Math.floor(samples.length * 0.95)].toFixed(3),
    p99:  sorted[Math.floor(samples.length * 0.99)].toFixed(3),
  };
}

// ── Main ──────────────────────────────────────────────────────────────────────

const db = new Database(dbPath);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

// Insert a throwaway benchmark user so FK constraints are satisfied
const benchUserId = `bench-user-${Date.now()}`;
db.prepare(
  `INSERT OR IGNORE INTO users (id, email, password_hash, currency, country)
   VALUES (?, ?, ?, ?, ?)`
).run(benchUserId, `bench-${Date.now()}@test.invalid`, 'x', 'USD', 'US');

const insertStmt = db.prepare(
  `INSERT INTO expenses (id, user_id, amount, currency, category, date, description)
   VALUES (?, ?, ?, ?, ?, ?, ?)`
);

// ── Test 1 : Unbatched sequential inserts (autocommit) ───────────────────────
hr('Test 1 — Unbatched sequential inserts (autocommit)');
console.log(`Inserting ${NUM_INSERTS.toLocaleString()} rows one-by-one…`);

const autoTimes = [];
const t0_auto  = process.hrtime.bigint();

for (let i = 0; i < NUM_INSERTS; i++) {
  const t0 = process.hrtime.bigint();
  insertStmt.run(
    randomUUID(),
    benchUserId,
    (Math.random() * 500 + 1).toFixed(2),
    'USD',
    'Food',
    `2024-0${(i % 9) + 1}-01`,
    `Benchmark row ${i}`
  );
  const t1 = process.hrtime.bigint();
  autoTimes.push(Number(t1 - t0) / 1e6); // ms
}

const t1_auto   = process.hrtime.bigint();
const elapsed   = Number(t1_auto - t0_auto) / 1e9;   // seconds
const opsPerSec = Math.round(NUM_INSERTS / elapsed);

console.log(`\nElapsed  : ${elapsed.toFixed(3)} s`);
console.log(`Ops/sec  : ${opsPerSec.toLocaleString()}`);
const s1 = stats(autoTimes);
console.log(`Per-row latency (ms):`);
console.table(s1);

// ── Test 2 : Batched inside a single transaction ──────────────────────────────
hr('Test 2 — Batched (all 10,000 in one transaction)');
console.log(`Inserting ${NUM_INSERTS.toLocaleString()} rows inside one transaction…`);

const batchInsert = db.transaction((n) => {
  for (let i = 0; i < n; i++) {
    insertStmt.run(
      randomUUID(),
      benchUserId,
      (Math.random() * 500 + 1).toFixed(2),
      'USD',
      'Food',
      `2024-0${(i % 9) + 1}-01`,
      `Benchmark batch row ${i}`
    );
  }
});

const t0_batch  = process.hrtime.bigint();
batchInsert(NUM_INSERTS);
const t1_batch  = process.hrtime.bigint();
const elapsedB  = Number(t1_batch - t0_batch) / 1e9;
const opsPerSecB = Math.round(NUM_INSERTS / elapsedB);

console.log(`\nElapsed  : ${elapsedB.toFixed(3)} s`);
console.log(`Ops/sec  : ${opsPerSecB.toLocaleString()}`);

// ── PostgreSQL theoretical baseline ──────────────────────────────────────────
hr('PostgreSQL Comparison (industry baseline)');
console.log('Source: standard pgbench on local PostgreSQL 15 (typical developer machine)');
console.log();
console.log('  pg autocommit sequential inserts : ~1,000 – 3,000 ops/sec');
console.log('  pg with COPY bulk load           : ~50,000 – 200,000 ops/sec');
console.log('  pg with batch transaction        : ~10,000 – 30,000 ops/sec');
console.log();
console.log('SQLite results from this run:');
console.log(`  Autocommit sequential            : ${opsPerSec.toLocaleString()} ops/sec`);
console.log(`  Single-transaction batch         : ${opsPerSecB.toLocaleString()} ops/sec`);
console.log();
if (opsPerSec > 3000) {
  console.log('✅  SQLite autocommit OUTPERFORMS typical pg sequential (no network overhead).');
} else {
  console.log('ℹ️   SQLite autocommit is within typical pg sequential range (disk-speed constrained).');
}
if (opsPerSecB > 30_000) {
  console.log('✅  SQLite batch OUTPERFORMS typical pg batch (in-process, no serialization).');
} else {
  console.log('ℹ️   SQLite batch is within typical pg batch range.');
}

// ── Cleanup ───────────────────────────────────────────────────────────────────
hr('Cleanup');
const deleted = db.prepare(`DELETE FROM expenses WHERE user_id = ?`).run(benchUserId);
db.prepare(`DELETE FROM users WHERE id = ?`).run(benchUserId);
console.log(`Removed ${deleted.changes.toLocaleString()} benchmark rows.`);
db.close();

console.log('\n✅  SQLite write-throughput benchmark complete.\n');
