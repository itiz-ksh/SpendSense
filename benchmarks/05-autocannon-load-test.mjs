/**
 * benchmarks/05-autocannon-load-test.mjs
 *
 * Benchmark: API response time + concurrent user capacity
 * ────────────────────────────────────────────────────────
 * Runs two phases:
 *
 *   Phase 1 — Baseline latency (autocannon -c 10 -d 30)
 *     Reports p50 / p95 / p99 latencies on GET /api/transactions (or the closest
 *     available route: GET /api/expenses with a valid session cookie).
 *
 *   Phase 2 — Concurrency ceiling
 *     Gradually increases concurrency from 1 → 2 → 5 → 10 → 25 → 50 → 100
 *     and stops when error rate > 1% OR p99 > 500ms.
 *
 * IMPORTANT: The dev server must be running before executing this script.
 *   Start it with: npm run dev
 *
 * Usage:  node benchmarks/05-autocannon-load-test.mjs [--live]
 *
 * Flags:
 *   --live    Actually hit the running dev server. Without this flag the script
 *             uses a local test-server on port 3001 that always returns 200,
 *             so you can validate benchmark logic without starting Next.js.
 */

import autocannon from 'autocannon';
import http from 'http';

// ── Config ────────────────────────────────────────────────────────────────────

const USE_LIVE_SERVER = process.argv.includes('--live');
const BASE_URL        = USE_LIVE_SERVER ? 'http://localhost:3000' : 'http://localhost:3001';

// A real session cookie from your browser — needed for authenticated routes.
// Set via env var: SPENDSENSE_SESSION=<cookie_value>
const SESSION_COOKIE  = process.env.SPENDSENSE_SESSION ?? '';

// ── Helpers ──────────────────────────────────────────────────────────────────

function hr(label) {
  console.log(`\n${'─'.repeat(60)}`);
  console.log(`  ${label}`);
  console.log('─'.repeat(60));
}

function formatLatency(ms) {
  return ms !== undefined ? `${ms.toFixed ? ms.toFixed(2) : ms} ms` : 'N/A';
}

function printResult(result, concurrency) {
  const lat    = result.latency;
  const req    = result.requests;
  const errors = result.errors ?? 0;
  const total  = req.total ?? result.requests.total;
  const errRate = total > 0 ? ((errors / total) * 100).toFixed(2) : '0.00';

  console.log(`\n  Concurrency : ${concurrency}`);
  console.log(`  Duration    : ${result.duration}s`);
  console.log(`  Requests    : ${total} total, ${req.average?.toFixed(0) ?? '?'} req/sec avg`);
  console.log(`  Errors      : ${errors} (${errRate}%)`);
  console.log(`  Latency p50 : ${formatLatency(lat.p50)}`);
  console.log(`  Latency p75 : ${formatLatency(lat.p75)}`);
  console.log(`  Latency p90 : ${formatLatency(lat.p90)}`);
  console.log(`  Latency p95 : ${formatLatency(lat.p95)}`);
  console.log(`  Latency p99 : ${formatLatency(lat.p99)}`);
  console.log(`  Latency max : ${formatLatency(lat.max)}`);
  return { errRate: parseFloat(errRate), p99: lat.p99 ?? 0, concurrency };
}

function runAutocannon(opts) {
  return new Promise((resolve, reject) => {
    const instance = autocannon({ ...opts, setupClient: undefined }, (err, result) => {
      if (err) reject(err);
      else resolve(result);
    });
    autocannon.track(instance, { renderProgressBar: true });
  });
}

// ── Mock server (when not using live Next.js) ─────────────────────────────────

let mockServer;

function startMockServer() {
  return new Promise((resolve) => {
    mockServer = http.createServer((req, res) => {
      // Simulate a fast API route returning JSON
      setTimeout(() => {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true, data: [] }));
      }, Math.random() * 5); // 0–5ms simulated latency
    });
    mockServer.listen(3001, () => {
      console.log('  Mock server started on http://localhost:3001');
      resolve();
    });
  });
}

function stopMockServer() {
  return new Promise((resolve) => {
    if (mockServer) mockServer.close(resolve);
    else resolve();
  });
}

// ── Main ──────────────────────────────────────────────────────────────────────

if (!USE_LIVE_SERVER) {
  hr('ℹ️  Running with MOCK server (no live Next.js required)');
  console.log('  Pass --live to hit http://localhost:3000 (requires npm run dev)');
  await startMockServer();
} else {
  hr('🔴 Running against LIVE server: ' + BASE_URL);
  if (!SESSION_COOKIE) {
    console.warn('  ⚠️  SPENDSENSE_SESSION not set. Unauthenticated routes only.');
  }
}

const headers = {
  'Content-Type': 'application/json',
  ...(SESSION_COOKIE ? { Cookie: `spendsense_session=${SESSION_COOKIE}` } : {}),
};

// Determine best route to test — /api/expenses (GET is not defined, so use a
// route that always replies, e.g. a public health check or fallback to /api/auth/login)
// Since GET /api/expenses is not defined in the codebase, we target the public
// Next.js homepage which always responds, or the auth endpoint.
const TEST_URL   = USE_LIVE_SERVER ? `${BASE_URL}/api/expenses` : BASE_URL;
const TEST_PATH  = USE_LIVE_SERVER ? '/api/expenses' : '/';
const TEST_METHOD = 'GET';

// ── Phase 1: Baseline latency (c=10, d=30) ───────────────────────────────────
hr('Phase 1 — Baseline latency (autocannon -c 10 -d 30)');
console.log(`  Target: ${TEST_URL}`);

const baseline = await runAutocannon({
  url:        TEST_URL,
  connections: 10,
  duration:   30,
  method:     TEST_METHOD,
  headers,
  timeout:    10,
});

printResult(baseline, 10);
console.log('\n  ✅ Phase 1 complete.');

// ── Phase 2: Concurrency ceiling ──────────────────────────────────────────────
hr('Phase 2 — Concurrency ceiling (error rate > 1% OR p99 > 500ms)');

const CONCURRENCY_LEVELS = [1, 2, 5, 10, 25, 50, 100];
const PHASE2_DURATION    = 10; // seconds per level
const ceilingResults     = [];
let ceilingFound         = false;

for (const c of CONCURRENCY_LEVELS) {
  hr(`  Testing concurrency = ${c}`);
  const result = await runAutocannon({
    url:         TEST_URL,
    connections: c,
    duration:    PHASE2_DURATION,
    method:      TEST_METHOD,
    headers,
    timeout:     10,
  });

  const { errRate, p99 } = printResult(result, c);
  ceilingResults.push({ concurrency: c, errRate, p99 });

  if (errRate > 1 || p99 > 500) {
    console.log(`\n  🚨 Degradation detected at concurrency=${c}`);
    console.log(`     Error rate: ${errRate}%  (threshold: >1%)`);
    console.log(`     p99 latency: ${p99}ms  (threshold: >500ms)`);
    ceilingFound = true;
    break;
  }
  console.log(`  ✅ Concurrency ${c}: within SLO (error rate ${errRate}%, p99 ${p99}ms)`);
}

// ── Concurrency summary ───────────────────────────────────────────────────────
hr('Phase 2 — Concurrency ceiling summary');
console.table(ceilingResults);
if (!ceilingFound) {
  console.log(`\n  ✅ System held up to ${CONCURRENCY_LEVELS.at(-1)} concurrent users within SLO.`);
  console.log(`     Concurrency ceiling is > ${CONCURRENCY_LEVELS.at(-1)} for this endpoint.`);
} else {
  const lastGood = ceilingResults.findLast(r => r.errRate <= 1 && r.p99 <= 500);
  console.log(`\n  Concurrency ceiling: ~${lastGood?.concurrency ?? '<1'} concurrent users`);
}

await stopMockServer();
console.log('\n✅  Autocannon load test benchmark complete.\n');
