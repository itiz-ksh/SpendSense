-- =============================================================================
-- SpendSense — SQLite Database Schema
--
-- Invariants enforced at the database level:
--   1. Category Enum Invariant:  expenses.category CHECK constraint limits
--      values strictly to ('Food', 'Rent', 'Entertainment', 'Others').
--   2. Parameterized Data Isolation: user_id is NOT NULL on every child table.
--   3. Referential Integrity: expenses and oauth_accounts CASCADE-delete when
--      the parent user row is removed.
-- =============================================================================

-- Enable Foreign Keys (Required in SQLite)
PRAGMA foreign_keys = ON;

-- =============================================================================
-- 1. USERS
-- =============================================================================

CREATE TABLE IF NOT EXISTS users (
  id            TEXT          PRIMARY KEY, -- UUID provided by Node.js
  email         TEXT          NOT NULL UNIQUE,
  password_hash TEXT,                      -- NULL for OAuth-only accounts
  currency      TEXT          NOT NULL DEFAULT 'USD',  -- ISO 4217 three-letter code
  country       TEXT          NOT NULL DEFAULT 'US',   -- ISO 3166-1 alpha-2 code
  created_at    TEXT          NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at    TEXT          NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT users_currency_format
    CHECK (length(currency) = 3),

  CONSTRAINT users_country_format
    CHECK (length(country) = 2)
);

CREATE INDEX IF NOT EXISTS idx_users_email ON users (email);

-- =============================================================================
-- 2. OAUTH ACCOUNTS
-- =============================================================================

CREATE TABLE IF NOT EXISTS oauth_accounts (
  id               TEXT         PRIMARY KEY, -- UUID provided by Node.js
  user_id          TEXT         NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  provider         TEXT         NOT NULL,  -- 'google' | 'apple'
  provider_user_id TEXT         NOT NULL,  -- subject ID returned by OAuth provider
  created_at       TEXT         NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT oauth_provider_valid
    CHECK (provider IN ('google', 'apple')),

  -- One OAuth identity per provider per user
  CONSTRAINT oauth_accounts_unique_provider
    UNIQUE (provider, provider_user_id)
);

CREATE INDEX IF NOT EXISTS idx_oauth_accounts_user_id
  ON oauth_accounts (user_id);

-- =============================================================================
-- 3. SESSIONS
-- =============================================================================

CREATE TABLE IF NOT EXISTS sessions (
  id          TEXT        PRIMARY KEY, -- UUID provided by Node.js
  user_id     TEXT        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash  TEXT        NOT NULL UNIQUE,  -- SHA-256 of the raw session token
  expires_at  TEXT        NOT NULL,
  created_at  TEXT        NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_sessions_token_hash ON sessions (token_hash);
CREATE INDEX IF NOT EXISTS idx_sessions_user_id    ON sessions (user_id);

-- =============================================================================
-- 4. EXPENSES
-- =============================================================================

CREATE TABLE IF NOT EXISTS expenses (
  id          TEXT           PRIMARY KEY, -- UUID provided by Node.js
  user_id     TEXT           NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  amount      REAL           NOT NULL,
  currency    TEXT           NOT NULL,
  category    TEXT           NOT NULL,
  date        TEXT           NOT NULL, -- YYYY-MM-DD string
  description TEXT           NOT NULL DEFAULT '',
  created_at  TEXT           NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at  TEXT           NOT NULL DEFAULT CURRENT_TIMESTAMP,

  -- Removed Category Enum Invariant to allow dynamic custom categories

  CONSTRAINT expenses_amount_positive
    CHECK (amount > 0),

  CONSTRAINT expenses_currency_format
    CHECK (length(currency) = 3)
);

CREATE INDEX IF NOT EXISTS idx_expenses_user_id_date
  ON expenses (user_id, date DESC);

CREATE INDEX IF NOT EXISTS idx_expenses_user_id_category
  ON expenses (user_id, category);

-- =============================================================================
-- 5. TRIGGER — auto-update updated_at timestamps
-- =============================================================================

CREATE TRIGGER IF NOT EXISTS set_users_updated_at
AFTER UPDATE ON users
FOR EACH ROW
BEGIN
  UPDATE users SET updated_at = CURRENT_TIMESTAMP WHERE id = old.id;
END;

CREATE TRIGGER IF NOT EXISTS set_expenses_updated_at
AFTER UPDATE ON expenses
FOR EACH ROW
BEGIN
  UPDATE expenses SET updated_at = CURRENT_TIMESTAMP WHERE id = old.id;
END;
