/**
 * benchmarks/live-benchmark-setup.mjs
 *
 * Creates a disposable benchmark user, logs in, captures the session cookie,
 * then runs autocannon against real Next.js routes.
 *
 * Usage: node benchmarks/live-benchmark-setup.mjs
 */

import autocannon from 'autocannon';
import { randomUUID } from 'crypto';

const BASE = 'http://localhost:3000';

// ── Helpers ──────────────────────────────────────────────────────────────────
function hr(label) {
  console.log(`\n${'─'.repeat(60)}`);
  console.log(`  ${label}`);
  console.log('─'.repeat(60));
}

function printResult(label, result) {
  const lat = result.latency;
  const req = result.requests;
  const errors = result.errors ?? 0;
  const total = req.total ?? 0;
  const errRate = total > 0 ? ((errors / total) * 100).toFixed(2) : '0.00';

  console.log(`\n  Route       : ${label}`);
  console.log(`  Duration    : ${result.duration}s`);
  console.log(`  Requests    : ${total} total`);
  console.log(`  Req/sec avg : ${req.average?.toFixed(0) ?? '?'}`);
  console.log(`  Errors      : ${errors} (${errRate}%)`);
  console.log(`  p50         : ${lat.p50} ms`);
  console.log(`  p75         : ${lat.p75} ms`);
  console.log(`  p90         : ${lat.p90} ms`);
  console.log(`  p99         : ${lat.p99} ms`);
  console.log(`  max         : ${lat.max} ms`);
  return { label, p50: lat.p50, p75: lat.p75, p90: lat.p90, p99: lat.p99, max: lat.max, rps: req.average, errors };
}

function runAutocannon(opts) {
  return new Promise((resolve, reject) => {
    const instance = autocannon(opts, (err, result) => {
      if (err) reject(err); else resolve(result);
    });
    autocannon.track(instance, { renderProgressBar: true });
  });
}

// ── Step 1: Register a benchmark test user ────────────────────────────────────
const BENCH_EMAIL    = `bench-${Date.now()}@benchmark.invalid`;
const BENCH_PASSWORD = 'BenchmarkPass123!';

hr('Step 1 — Registering benchmark user');
console.log(`  Email: ${BENCH_EMAIL}`);

const regRes = await fetch(`${BASE}/api/auth/register`, {
  method:  'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    email:    BENCH_EMAIL,
    password: BENCH_PASSWORD,
    currency: 'USD',
    country:  'US',
  }),
});

if (!regRes.ok && regRes.status !== 201) {
  const body = await regRes.text();
  throw new Error(`Registration failed (${regRes.status}): ${body}`);
}

const setCookieHeader = regRes.headers.get('set-cookie') ?? '';
const sessionMatch    = setCookieHeader.match(/spendsense_session=([^;]+)/);
if (!sessionMatch) {
  throw new Error(`No session cookie in register response. Header: ${setCookieHeader}`);
}
const sessionCookie = sessionMatch[1];
console.log(`  ✅ Registered. Session cookie captured (${sessionCookie.length} chars).`);

// ── Step 2: Insert some expenses so dashboard has data ────────────────────────
hr('Step 2 — Seeding 5 benchmark expenses');
const CATEGORIES = ['Food', 'Rent', 'Entertainment', 'Others', 'Travel'];
for (let i = 0; i < 5; i++) {
  await fetch(`${BASE}/api/expenses`, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json', 'Cookie': `spendsense_session=${sessionCookie}` },
    body: JSON.stringify({
      amount:      (Math.random() * 100 + 1).toFixed(2),
      currency:    'USD',
      category:    CATEGORIES[i % CATEGORIES.length],
      date:        `2024-0${(i % 9) + 1}-15`,
      description: `Benchmark expense ${i}`,
    }),
  });
}
console.log('  ✅ Seeded.');

const authHeaders = {
  'Cookie':       `spendsense_session=${sessionCookie}`,
  'Content-Type': 'application/json',
};

const results = [];

// ── Test A: POST /api/auth/login (bcrypt path) ────────────────────────────────
// Note: autocannon sends concurrent POST requests each triggering a full bcrypt.compare().
// This is intentionally low concurrency (c=3) because bcrypt blocks the event loop ~250ms.
// Higher concurrency would just pile up requests behind the single bcrypt call.
hr('Test A — POST /api/auth/login  (c=3, d=30)');
console.log('  ⚠️  bcrypt at cost=12 takes ~250ms per request — p50 will reflect this.');

const loginBody = JSON.stringify({ email: BENCH_EMAIL, password: BENCH_PASSWORD });
const loginResult = await runAutocannon({
  url:         `${BASE}/api/auth/login`,
  connections: 3,
  duration:    30,
  method:      'POST',
  headers:     { 'Content-Type': 'application/json' },
  body:        loginBody,
  timeout:     10,
});
results.push(printResult('POST /api/auth/login', loginResult));

// ── Test B: POST /api/expenses (auth + DB write path) ─────────────────────────
hr('Test B — POST /api/expenses  (c=10, d=30)');
const expenseBody = JSON.stringify({
  amount: 29.99, currency: 'USD', category: 'Food',
  date: '2024-07-15', description: 'Autocannon benchmark',
});

const expenseResult = await runAutocannon({
  url:         `${BASE}/api/expenses`,
  connections: 10,
  duration:    30,
  method:      'POST',
  headers:     authHeaders,
  body:        expenseBody,
  timeout:     10,
});
results.push(printResult('POST /api/expenses', expenseResult));

// ── Test C: GET / (home page — unauthenticated, static) ─────────────────────
hr('Test C — GET /  (c=10, d=30, no auth)');
const homeResult = await runAutocannon({
  url:         `${BASE}/`,
  connections: 10,
  duration:    30,
  method:      'GET',
  timeout:     10,
});
results.push(printResult('GET /', homeResult));

// ── Test D: Concurrency ceiling on POST /api/expenses ──────────────────────
hr('Test D — Concurrency ceiling on POST /api/expenses');
const ceilingLevels = [1, 5, 10, 25, 50];
const ceilingRows   = [];

for (const c of ceilingLevels) {
  const r = await runAutocannon({
    url: `${BASE}/api/expenses`, connections: c, duration: 10,
    method: 'POST', headers: authHeaders, body: expenseBody, timeout: 10,
  });
  const errRate = r.errors > 0 ? ((r.errors / r.requests.total) * 100).toFixed(2) : '0.00';
  ceilingRows.push({ c, p99: r.latency.p99, errRate, rps: r.requests.average?.toFixed(0) });
  console.log(`  c=${c}: p99=${r.latency.p99}ms, err=${errRate}%, rps=${r.requests.average?.toFixed(0)}`);
  if (parseFloat(errRate) > 1 || r.latency.p99 > 500) {
    console.log(`  🚨 Degradation at c=${c}`);
    break;
  }
}

// ── Summary ───────────────────────────────────────────────────────────────────
hr('LIVE BENCHMARK RESULTS SUMMARY');
console.log('\n  Route latencies (c=10, d=30):');
console.table(results.map(r => ({
  Route:    r.label,
  'p50 ms': r.p50,
  'p75 ms': r.p75,
  'p99 ms': r.p99,
  'max ms': r.max,
  'req/s':  r.rps?.toFixed(0) ?? '?',
  Errors:   r.errors,
})));

console.log('\n  Concurrency ceiling (POST /api/expenses):');
console.table(ceilingRows);

console.log('\n  Copy these numbers into README.md benchmark table.');
console.log('\n✅  Live benchmark complete.\n');

// ── Cleanup: delete the benchmark user via direct DB touch ───────────────────
// We can't delete via API (no delete user endpoint), so we log a note.
console.log(`  Note: benchmark user ${BENCH_EMAIL} remains in spendsense.db.`);
console.log('  Run: sqlite3 spendsense.db "DELETE FROM users WHERE email LIKE \'bench-%\';"');
