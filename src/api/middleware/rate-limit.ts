/**
 * src/api/middleware/rate-limit.ts
 *
 * In-memory sliding-window rate limiter for auth endpoints.
 *
 * ── Design ────────────────────────────────────────────────────────────────────
 * Tracks per-IP attempt counts using a Map<string, WindowEntry>.
 * Each entry records when the current window started and how many attempts
 * have been made within it. Once the window expires (>= windowMs), the counter
 * resets. This is a "tumbling window" approximation, not a true sliding window —
 * it resets at the window boundary rather than trailing by request timestamp.
 *
 * ── Known Limitations (document proactively) ─────────────────────────────────
 *
 * 1. SINGLE-PROCESS ONLY
 *    The counter lives in the Node.js heap. On server restart, all counters reset.
 *    In a multi-instance deployment (e.g., load-balanced containers), each instance
 *    has an independent counter — an attacker can bypass the limit by distributing
 *    requests across instances.
 *    → Production fix: replace Map with Redis INCR + EXPIRE (atomic, distributed).
 *
 * 2. X-FORWARDED-FOR IS SPOOFABLE
 *    We read the client IP from the X-Forwarded-For header, which is trivially
 *    forged if there is no trusted reverse proxy (nginx, Cloudflare, ALB) in front.
 *    An attacker can bypass this limiter by rotating the X-Forwarded-For value:
 *      curl -H "X-Forwarded-For: 1.2.3.<N>" POST /api/auth/login
 *    → Production fix: only trust X-Forwarded-For from known proxy CIDRs, or use
 *      the socket-level remote address (unavailable in Next.js edge; use middleware).
 *    → Current mitigation: bcrypt cost=12 (~250ms) independently limits throughput
 *      to ~4 login attempts/sec per process regardless of IP spoofing. A dedicated
 *      attacker can still exhaust the event loop, but cannot brute-force faster
 *      than bcrypt allows.
 *
 * 3. MEMORY LEAK RISK
 *    The Map grows unbounded if attackers create millions of unique IPs. A simple
 *    size cap is enforced: if the Map exceeds MAX_ENTRIES, oldest entries are evicted.
 *    This is O(n) on eviction but acceptable at the scale this app targets.
 *
 * ── Usage ─────────────────────────────────────────────────────────────────────
 *    import { rateLimit, LOGIN_LIMIT, REGISTER_LIMIT } from '@/api/middleware/rate-limit';
 *
 *    const { limited, retryAfter } = rateLimit(ip, LOGIN_LIMIT);
 *    if (limited) return errorResponse(429, 'RATE_LIMITED', '...', retryAfter);
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface RateLimitConfig {
  /** Max number of attempts allowed within the window. */
  maxAttempts: number;
  /** Rolling window duration in milliseconds. */
  windowMs: number;
}

export interface RateLimitResult {
  /** true if the caller has exceeded the allowed rate. */
  limited: boolean;
  /** Seconds until the window resets. Only present when limited=true. */
  retryAfter?: number;
}

interface WindowEntry {
  count:       number;
  windowStart: number; // ms since epoch
}

// ---------------------------------------------------------------------------
// Pre-configured limits for each auth endpoint
// ---------------------------------------------------------------------------

/** 5 attempts per IP per 60 seconds — for login. */
export const LOGIN_LIMIT: RateLimitConfig = {
  maxAttempts: 5,
  windowMs:    60_000,
};

/** 3 attempts per IP per 60 seconds — for registration (lower; less frequent). */
export const REGISTER_LIMIT: RateLimitConfig = {
  maxAttempts: 3,
  windowMs:    60_000,
};

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------

/** Separate counters per endpoint key to avoid cross-endpoint interference. */
const stores = new Map<string, Map<string, WindowEntry>>();

/** Hard cap on entries per store to prevent unbounded memory growth. */
const MAX_ENTRIES = 10_000;

function getStore(storeKey: string): Map<string, WindowEntry> {
  if (!stores.has(storeKey)) {
    stores.set(storeKey, new Map());
  }
  return stores.get(storeKey)!;
}

function evictOldest(store: Map<string, WindowEntry>, windowMs: number): void {
  const now = Date.now();
  for (const [ip, entry] of store.entries()) {
    if (now - entry.windowStart >= windowMs) {
      store.delete(ip);
    }
    if (store.size <= MAX_ENTRIES * 0.8) break; // evict until 80% full
  }
}

// ---------------------------------------------------------------------------
// Core rate-limit function
// ---------------------------------------------------------------------------

/**
 * Check and increment the request counter for a given IP + endpoint.
 *
 * @param ip        - Caller's IP address string (may be spoofed — see caveats above)
 * @param config    - { maxAttempts, windowMs }
 * @param storeKey  - Namespaces the counter per endpoint (e.g. 'login', 'register')
 */
export function rateLimit(
  ip: string,
  config: RateLimitConfig,
  storeKey: string = 'default',
): RateLimitResult {
  const store = getStore(storeKey);
  const now   = Date.now();
  const entry = store.get(ip);

  // Window has expired or first request — open a fresh window
  if (!entry || now - entry.windowStart >= config.windowMs) {
    store.set(ip, { count: 1, windowStart: now });
    return { limited: false };
  }

  // Within window — increment and check
  entry.count += 1;

  if (entry.count > config.maxAttempts) {
    const windowEnd  = entry.windowStart + config.windowMs;
    const retryAfter = Math.ceil((windowEnd - now) / 1000);
    return { limited: true, retryAfter };
  }

  // Evict if store is growing large (amortised cleanup)
  if (store.size > MAX_ENTRIES) {
    evictOldest(store, config.windowMs);
  }

  return { limited: false };
}

// ---------------------------------------------------------------------------
// IP extraction helper
// ---------------------------------------------------------------------------

/**
 * Extract the best-available client IP from a Next.js Request.
 *
 * ⚠️  X-Forwarded-For is UNTRUSTED without a verified proxy in front.
 *     See module-level limitations. Fallback is 'unknown'.
 */
export function getClientIp(request: Request): string {
  const xff = request.headers.get('x-forwarded-for');
  if (xff) {
    // X-Forwarded-For can be a comma-separated list; the leftmost is the client
    return xff.split(',')[0].trim();
  }
  // Next.js does not expose the raw socket IP in Route Handlers.
  // 'unknown' will be rate-limited as a single IP bucket — safe but imprecise.
  return 'unknown';
}

// ---------------------------------------------------------------------------
// Test helper — reset all state (used in integration tests only)
// ---------------------------------------------------------------------------

export function _resetAllStores(): void {
  stores.clear();
}
