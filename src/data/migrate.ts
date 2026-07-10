/**
 * src/data/migrate.ts
 *
 * One-shot migration runner for SpendSense.
 *
 * Reads `schema.sql` from the same directory and executes it against the
 * configured PostgreSQL database. All CREATE TABLE / CREATE INDEX / CREATE
 * TRIGGER statements use IF NOT EXISTS / OR REPLACE so this script is safe
 * to re-run without data loss (idempotent).
 *
 * Usage:
 *   npx ts-node --project tsconfig.json src/data/migrate.ts
 *   — OR —
 *   npx tsx src/data/migrate.ts
 *
 * Required environment variable:
 *   DATABASE_URL=postgres://user:pass@host:5432/dbname
 */

import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';

// Load .env.local before importing the pool so DATABASE_URL is available.
dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

import { query, exec, closePool } from './db';

// ---------------------------------------------------------------------------
// Main migration function
// ---------------------------------------------------------------------------

async function migrate(): Promise<void> {
  const schemaPath = path.join(__dirname, 'schema.sql');

  if (!fs.existsSync(schemaPath)) {
    throw new Error(
      `[migrate] schema.sql not found at expected path: ${schemaPath}`
    );
  }

  const sql = fs.readFileSync(schemaPath, 'utf-8');

  console.log('[migrate] Connecting to database...');

  try {
    console.log('[migrate] Executing schema.sql ...');
    await exec(sql);

    console.log('[migrate] Checking if expenses table has category constraint...');
    const result = await query<{ sql: string }>(`SELECT sql FROM sqlite_master WHERE type='table' AND name='expenses'`);
    const createTableSql = result.rows[0]?.sql || '';
    
    if (createTableSql.includes('expenses_category_valid')) {
      console.log('[migrate] Removing category constraint from expenses table...');
      
      // SQLite requires recreating the table to remove a constraint
      const migrationSql = `
        PRAGMA foreign_keys = OFF;
        BEGIN TRANSACTION;
        
        CREATE TABLE expenses_new (
          id          TEXT           PRIMARY KEY,
          user_id     TEXT           NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          amount      REAL           NOT NULL,
          currency    TEXT           NOT NULL,
          category    TEXT           NOT NULL,
          date        TEXT           NOT NULL,
          description TEXT           NOT NULL DEFAULT '',
          created_at  TEXT           NOT NULL DEFAULT CURRENT_TIMESTAMP,
          updated_at  TEXT           NOT NULL DEFAULT CURRENT_TIMESTAMP,
          CONSTRAINT expenses_amount_positive CHECK (amount > 0),
          CONSTRAINT expenses_currency_format CHECK (length(currency) = 3)
        );
        
        INSERT INTO expenses_new SELECT * FROM expenses;
        DROP TABLE expenses;
        ALTER TABLE expenses_new RENAME TO expenses;
        
        CREATE INDEX idx_expenses_user_id_date ON expenses (user_id, date DESC);
        CREATE INDEX idx_expenses_user_id_category ON expenses (user_id, category);
        
        COMMIT;
        PRAGMA foreign_keys = ON;
      `;
      
      await exec(migrationSql);
      console.log('[migrate] Successfully removed constraint from expenses table.');
    }

    console.log('[migrate] ✓ Migration complete. All tables and constraints are in place.');
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('[migrate] ✗ Migration failed:', message);
    process.exitCode = 1;
  } finally {
    await closePool();
    console.log('[migrate] Connection pool closed.');
  }
}

migrate();
