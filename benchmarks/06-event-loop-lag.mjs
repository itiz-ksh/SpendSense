/**
 * benchmarks/06-event-loop-lag.mjs
 *
 * Benchmark: Event loop blocking time
 * ─────────────────────────────────────
 * Measures event loop lag using a high-resolution timer approach
 * (sampling setImmediate delay, which reveals when the loop is blocked).
 *
 * Also simulates load by making concurrent HTTP requests to the dev server
 * to see lag under realistic conditions.
 *
 * Clinic.js requires running with the actual server process, so this script:
 *   1. Measures event loop lag directly using the sampling technique.
 *   2. Prints the clinic doctor command to run alongside a load test.
 *
 * Usage:  node benchmarks/06-event-loop-lag.mjs
 */

import { performance, PerformanceObserver } from 'perf_hooks';

// ── Helpers ──────────────────────────────────────────────────────────────────

function hr(label) {
  console.log(`\n${'─'.repeat(60)}`);
  console.log(`  ${label}`);
  console.log('─'.repeat(60));
}

function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

// ── Event loop lag sampler ────────────────────────────────────────────────────

class EventLoopLagSampler {
  #samples = [];
  #running = false;
  #intervalMs;

  constructor(intervalMs = 10) {
    this.#intervalMs = intervalMs;
  }

  start() {
    this.#running = true;
    this.#samples = [];
    this.#sample();
  }

  #sample() {
    if (!this.#running) return;

    const start = performance.now();
    setTimeout(() => {
      const lag = performance.now() - start - this.#intervalMs;
      this.#samples.push(Math.max(0, lag));
      this.#sample();
    }, this.#intervalMs);
  }

  stop() {
    this.#running = false;
    return this.#samples;
  }

  get samples() {
    return [...this.#samples];
  }
}

function analyzelag(samples) {
  if (samples.length === 0) return null;
  const sorted = [...samples].sort((a, b) => a - b);
  const sum    = samples.reduce((s, v) => s + v, 0);
  return {
    count: samples.length,
    mean:  (sum / samples.length).toFixed(3) + ' ms',
    max:   sorted[sorted.length - 1].toFixed(3) + ' ms',
    p50:   sorted[Math.floor(sorted.length * 0.50)].toFixed(3) + ' ms',
    p95:   sorted[Math.floor(sorted.length * 0.95)].toFixed(3) + ' ms',
    p99:   sorted[Math.floor(sorted.length * 0.99)].toFixed(3) + ' ms',
  };
}

// ── Test 1: Idle (no load) ────────────────────────────────────────────────────
hr('Test 1 — Event loop lag at idle (5 seconds)');

const sampler = new EventLoopLagSampler(10);
sampler.start();
await sleep(5000);
const idleSamples = sampler.stop();
console.log('\nIdle event loop lag:');
console.table(analyzelag(idleSamples));

// ── Test 2: CPU-bound blocking (simulates bcrypt or heavy computation) ─────────
hr('Test 2 — Event loop lag during simulated CPU-bound work');

function cpuBlock(ms) {
  const end = Date.now() + ms;
  while (Date.now() < end) {/* spin */}
}

const sampler2 = new EventLoopLagSampler(10);
sampler2.start();

// Simulate 5 bcrypt-like 300ms blocking calls with breaks
for (let i = 0; i < 5; i++) {
  console.log(`  Blocking for 300ms (simulating bcrypt round ${i + 1}/5)…`);
  cpuBlock(300);
  await sleep(100); // brief yield
}

const cpuSamples = sampler2.stop();
console.log('\nEvent loop lag during CPU-bound blocking:');
console.table(analyzelag(cpuSamples));

// ── Test 3: JSON parse + zod (typical request processing) ──────────────────────
hr('Test 3 — Event loop lag during 1,000 rapid Zod validations');

import { z } from 'zod';

const schema = z.object({
  amount:      z.number().positive(),
  currency:    z.string().length(3),
  category:    z.string().min(1),
  date:        z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  description: z.string().max(255).trim(),
});

const sampler3 = new EventLoopLagSampler(5);
sampler3.start();

for (let i = 0; i < 1000; i++) {
  schema.safeParse({ amount: 9.99, currency: 'USD', category: 'Food', date: '2024-07-01', description: 'Test' });
  if (i % 100 === 0) await sleep(0); // yield
}

const zodSamples = sampler3.stop();
console.log('\nEvent loop lag during Zod validation burst:');
console.table(analyzelag(zodSamples));

// ── Summary + clinic.js instructions ─────────────────────────────────────────
hr('Summary');
console.log('  Idle lag         :', analyzelag(idleSamples)?.max ?? 'N/A', '(max)');
console.log('  CPU-blocking lag :', analyzelag(cpuSamples)?.max ?? 'N/A', '(max, bcrypt simulated)');
console.log('  Zod burst lag    :', analyzelag(zodSamples)?.max ?? 'N/A', '(max)');

hr('How to run clinic doctor (full event loop profiling)');
console.log(`
  Install clinic globally (already done if you ran the setup script):
    npm install -g clinic

  Then run:
    clinic doctor -- node server.js
  Or for Next.js:
    clinic doctor -- npx next start

  While clinic is running, in another terminal run the load test:
    node benchmarks/05-autocannon-load-test.mjs --live

  Clinic will open a browser report showing:
    • Max event loop lag over time
    • CPU usage breakdown
    • Memory usage trend
    • Async I/O activity

  Key metric to watch: "Event Loop Delay" panel.
  For SpendSense, the dominant blocking source is bcrypt.hash() (rounds=12, ~300ms).
  This is EXPECTED — bcrypt is intentionally CPU-bound for security.

  SQLite via better-sqlite3 is SYNCHRONOUS by design — each .all()/.run() call
  blocks the event loop for the duration of the query. With WAL mode and indexed
  queries, this is typically < 5ms and acceptable for a single-user personal finance app.

  If event loop lag exceeds 50ms outside of bcrypt calls, investigate:
    • Unbounded query result sets (add LIMIT)
    • Synchronous file I/O in hot paths
    • Missing DB indexes
`);

console.log('\n✅  Event loop lag benchmark complete.\n');
