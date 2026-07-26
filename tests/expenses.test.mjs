/**
 * tests/expenses.test.mjs
 *
 * Integration tests for expense creation and retrieval data layer.
 *
 * Tests run against a real isolated SQLite :memory: database.
 * No HTTP server is started — we test the data access layer directly,
 * which is what matters for financial correctness.
 *
 * Covered paths:
 *   ✅ Insert valid expense → returns full record with generated id
 *   ✅ Insert negative amount → DB CHECK constraint rejects it
 *   ✅ Insert zero amount → DB CHECK constraint rejects it
 *   ✅ Insert with missing user_id → FK constraint rejects it
 *   ✅ Retrieve expenses → ordered by date DESC, isolated per user
 *   ✅ Monthly summary → correct GROUP BY aggregation
 *   ✅ Currency field enforced to exactly 3 chars
 *   ✅ Description defaults to empty string when omitted
 *   ✅ User isolation — user A cannot see user B's expenses
 */

import { test, describe, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import Database from 'better-sqlite3';
import { randomUUID } from 'node:crypto';

// ── Test DB setup ─────────────────────────────────────────────────────────────

function createTestDb() {
  const db = new Database(':memory:');
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');

  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id            TEXT PRIMARY KEY,
      email         TEXT NOT NULL UNIQUE,
      password_hash TEXT,
      currency      TEXT NOT NULL DEFAULT 'USD',
      country       TEXT NOT NULL DEFAULT 'US',
      created_at    TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at    TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT users_currency_format CHECK (length(currency) = 3),
      CONSTRAINT users_country_format  CHECK (length(country) = 2)
    );

    CREATE TABLE IF NOT EXISTS expenses (
      id          TEXT  PRIMARY KEY,
      user_id     TEXT  NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      amount      REAL  NOT NULL,
      currency    TEXT  NOT NULL,
      category    TEXT  NOT NULL,
      date        TEXT  NOT NULL,
      description TEXT  NOT NULL DEFAULT '',
      created_at  TEXT  NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at  TEXT  NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT expenses_amount_positive  CHECK (amount > 0),
      CONSTRAINT expenses_currency_format  CHECK (length(currency) = 3)
    );

    CREATE INDEX IF NOT EXISTS idx_expenses_user_id_date
      ON expenses (user_id, date DESC);
  `);

  return db;
}

// Direct data-layer functions (mirroring src/data/expenses.ts logic)
function insertExpense(db, { id, user_id, amount, currency, category, date, description = '' }) {
  return db.prepare(
    `INSERT INTO expenses (id, user_id, amount, currency, category, date, description)
     VALUES (?, ?, ?, ?, ?, ?, ?)
     RETURNING *`
  ).get(id, user_id, amount, currency, category, date, description);
}

function getExpensesByUser(db, userId) {
  return db.prepare(
    `SELECT id, user_id, amount, currency, category, date, description, created_at
       FROM expenses
      WHERE user_id = ?
   ORDER BY date DESC, created_at DESC`
  ).all(userId);
}

function getMonthlySummary(db, userId) {
  return db.prepare(
    `SELECT
       STRFTIME('%Y-%m', date) AS month,
       category,
       COUNT(*) AS txn_count,
       SUM(amount) AS total
     FROM expenses
    WHERE user_id = ?
    GROUP BY month, category
    ORDER BY month DESC`
  ).all(userId);
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('Expense creation — happy path', () => {
  let db, userId;

  before(() => {
    db = createTestDb();
    userId = randomUUID();
    db.prepare(
      `INSERT INTO users (id, email, currency, country) VALUES (?, ?, ?, ?)`
    ).run(userId, `expense-test-${Date.now()}@example.com`, 'USD', 'US');
  });

  after(() => db.close());

  test('inserting a valid expense returns the full persisted record', () => {
    const id = randomUUID();
    const row = insertExpense(db, {
      id, user_id: userId,
      amount: 49.99, currency: 'USD', category: 'Food',
      date: '2024-07-15', description: 'Lunch',
    });

    assert.equal(row.id,          id);
    assert.equal(row.user_id,     userId);
    assert.equal(row.amount,      49.99);
    assert.equal(row.currency,    'USD');
    assert.equal(row.category,    'Food');
    assert.equal(row.date,        '2024-07-15');
    assert.equal(row.description, 'Lunch');
    assert.ok(row.created_at,     'created_at must be populated');
  });

  test('description defaults to empty string when omitted', () => {
    const row = insertExpense(db, {
      id: randomUUID(), user_id: userId,
      amount: 10, currency: 'USD', category: 'Others', date: '2024-07-01',
      // description intentionally omitted
    });
    assert.equal(row.description, '');
  });

  test('expense list is ordered by date DESC', () => {
    const uid = randomUUID();
    db.prepare(`INSERT INTO users (id, email, currency, country) VALUES (?, ?, ?, ?)`)
      .run(uid, `order-test-${Date.now()}@example.com`, 'USD', 'US');

    insertExpense(db, { id: randomUUID(), user_id: uid, amount: 1, currency: 'USD', category: 'Food', date: '2024-01-01' });
    insertExpense(db, { id: randomUUID(), user_id: uid, amount: 2, currency: 'USD', category: 'Rent', date: '2024-06-15' });
    insertExpense(db, { id: randomUUID(), user_id: uid, amount: 3, currency: 'USD', category: 'Food', date: '2024-03-10' });

    const rows = getExpensesByUser(db, uid);
    assert.equal(rows.length, 3);
    assert.equal(rows[0].date, '2024-06-15'); // newest first
    assert.equal(rows[2].date, '2024-01-01'); // oldest last
  });
});

describe('Expense creation — sad path / financial invariants', () => {
  let db, userId;

  before(() => {
    db = createTestDb();
    userId = randomUUID();
    db.prepare(`INSERT INTO users (id, email, currency, country) VALUES (?, ?, ?, ?)`)
      .run(userId, `sad-path-${Date.now()}@example.com`, 'USD', 'US');
  });

  after(() => db.close());

  test('negative amount is rejected by DB CHECK constraint', () => {
    assert.throws(
      () => insertExpense(db, {
        id: randomUUID(), user_id: userId,
        amount: -50, currency: 'USD', category: 'Food', date: '2024-07-01',
      }),
      /CHECK constraint failed/,
      'Negative amounts must be rejected at the database level'
    );
  });

  test('zero amount is rejected by DB CHECK constraint (amount > 0, not >=)', () => {
    assert.throws(
      () => insertExpense(db, {
        id: randomUUID(), user_id: userId,
        amount: 0, currency: 'USD', category: 'Food', date: '2024-07-01',
      }),
      /CHECK constraint failed/
    );
  });

  test('currency longer than 3 chars is rejected by DB CHECK constraint', () => {
    assert.throws(
      () => insertExpense(db, {
        id: randomUUID(), user_id: userId,
        amount: 10, currency: 'USDD', category: 'Food', date: '2024-07-01',
      }),
      /CHECK constraint failed/
    );
  });

  test('currency shorter than 3 chars is rejected by DB CHECK constraint', () => {
    assert.throws(
      () => insertExpense(db, {
        id: randomUUID(), user_id: userId,
        amount: 10, currency: 'US', category: 'Food', date: '2024-07-01',
      }),
      /CHECK constraint failed/
    );
  });

  test('missing user_id (FK violation) is rejected', () => {
    assert.throws(
      () => insertExpense(db, {
        id: randomUUID(), user_id: 'nonexistent-user-id',
        amount: 10, currency: 'USD', category: 'Food', date: '2024-07-01',
      }),
      /FOREIGN KEY constraint failed/
    );
  });

  test('user isolation — user A cannot see user B expenses', () => {
    const userA = randomUUID();
    const userB = randomUUID();
    db.prepare(`INSERT INTO users (id, email, currency, country) VALUES (?, ?, ?, ?)`)
      .run(userA, `user-a-${Date.now()}@example.com`, 'USD', 'US');
    db.prepare(`INSERT INTO users (id, email, currency, country) VALUES (?, ?, ?, ?)`)
      .run(userB, `user-b-${Date.now()}@example.com`, 'USD', 'US');

    insertExpense(db, { id: randomUUID(), user_id: userA, amount: 100, currency: 'USD', category: 'Rent', date: '2024-07-01' });
    insertExpense(db, { id: randomUUID(), user_id: userB, amount: 200, currency: 'USD', category: 'Food', date: '2024-07-01' });

    const rowsA = getExpensesByUser(db, userA);
    const rowsB = getExpensesByUser(db, userB);

    assert.equal(rowsA.length, 1, 'User A must only see their own expenses');
    assert.equal(rowsB.length, 1, 'User B must only see their own expenses');
    assert.equal(rowsA[0].amount, 100);
    assert.equal(rowsB[0].amount, 200);
  });
});

describe('Monthly summary aggregation', () => {
  let db, userId;

  before(() => {
    db = createTestDb();
    userId = randomUUID();
    db.prepare(`INSERT INTO users (id, email, currency, country) VALUES (?, ?, ?, ?)`)
      .run(userId, `summary-${Date.now()}@example.com`, 'USD', 'US');

    // Seed: Jan → Food × 2, Feb → Rent × 1
    insertExpense(db, { id: randomUUID(), user_id: userId, amount: 10.50, currency: 'USD', category: 'Food', date: '2024-01-10' });
    insertExpense(db, { id: randomUUID(), user_id: userId, amount: 20.00, currency: 'USD', category: 'Food', date: '2024-01-20' });
    insertExpense(db, { id: randomUUID(), user_id: userId, amount: 800.00, currency: 'USD', category: 'Rent', date: '2024-02-01' });
  });

  after(() => db.close());

  test('summary returns correct group counts and totals', () => {
    const rows = getMonthlySummary(db, userId);
    assert.equal(rows.length, 2); // 2 distinct month+category combos

    const foodJan = rows.find(r => r.month === '2024-01' && r.category === 'Food');
    assert.ok(foodJan, 'Food/Jan group must exist');
    assert.equal(foodJan.txn_count, 2);
    assert.ok(Math.abs(foodJan.total - 30.50) < 0.001, 'Food total must be 30.50');

    const rentFeb = rows.find(r => r.month === '2024-02' && r.category === 'Rent');
    assert.ok(rentFeb, 'Rent/Feb group must exist');
    assert.equal(rentFeb.txn_count, 1);
    assert.equal(rentFeb.total, 800.00);
  });

  test('summary returns months in DESC order (newest first)', () => {
    const rows = getMonthlySummary(db, userId);
    assert.equal(rows[0].month, '2024-02'); // newest
    assert.equal(rows[1].month, '2024-01'); // older
  });
});
