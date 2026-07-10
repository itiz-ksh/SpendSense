/**
 * src/data/db.ts
 *
 * Provides a lightweight wrapper over `better-sqlite3` that intercepts
 * PostgreSQL-style parameterized queries (e.g. $1, $2) and translates them
 * to SQLite syntax (?, ?). This allows us to use SQLite without rewriting
 * the entire application's query syntax.
 */

import Database from 'better-sqlite3';
import path from 'path';

// Instantiate SQLite singleton pointing to a local .db file
const dbPath = path.join(process.cwd(), 'spendsense.db');
const db = new Database(dbPath);

// Enable Write-Ahead Logging for better concurrency
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

/**
 * query(text, params)
 *
 * Intercepts PG-style queries (`WHERE id = $1`) and maps them to SQLite (`WHERE id = ?`).
 * Returns an object with a `rows` array to match the old `pg` driver shape.
 *
 * @param text   - SQL string with $1, $2 … placeholders
 * @param params - Array of parameter values matching the placeholders
 */
export async function query<T = any>(text: string, params: any[] = []): Promise<{ rows: T[] }> {
  // Translate PostgreSQL placeholders ($1, $2) to SQLite placeholders (?)
  const sql = text.replace(/\$\d+/g, '?');

  // SQLite cannot bind Date objects directly. Convert Dates to ISO strings.
  const mappedParams = params.map(p => (p instanceof Date ? p.toISOString() : p));

  try {
    const stmt = db.prepare(sql);

    // Determine if we should use .all() (for returning data) or .run() (for mutation)
    const upperSql = sql.trim().toUpperCase();
    const returnsData = upperSql.startsWith('SELECT') || upperSql.includes('RETURNING');

    if (returnsData) {
      const rows = stmt.all(...mappedParams) as T[];
      return { rows };
    } else {
      stmt.run(...mappedParams);
      return { rows: [] };
    }
  } catch (error) {
    console.error('[SpendSense/db] Query execution failed:', { sql, params });
    throw error;
  }
}

/**
 * exec(sql)
 *
 * Executes multiple SQL statements (e.g. for migrations).
 */
export async function exec(sql: string) {
  try {
    db.exec(sql);
  } catch (error) {
    console.error('[SpendSense/db] Exec failed:', { sql });
    throw error;
  }
}

/**
 * getClient()
 *
 * Returns a transaction-capable client matching the old `pg` API.
 * In `better-sqlite3`, transactions are synchronous. We wrap it in a mock client.
 */
export async function getClient() {
  return {
    query: async (text: string, params?: any[]) => {
      // If the caller uses BEGIN/COMMIT/ROLLBACK, we translate to .run()
      const upperSql = text.trim().toUpperCase();
      if (upperSql === 'BEGIN') {
        db.prepare('BEGIN').run();
        return { rows: [] };
      }
      if (upperSql === 'COMMIT') {
        db.prepare('COMMIT').run();
        return { rows: [] };
      }
      if (upperSql === 'ROLLBACK') {
        db.prepare('ROLLBACK').run();
        return { rows: [] };
      }
      return query(text, params);
    },
    release: () => {
      // No-op for SQLite singleton
    },
  };
}

/**
 * closePool()
 *
 * Shuts down the SQLite connection.
 */
export async function closePool() {
  db.close();
}
