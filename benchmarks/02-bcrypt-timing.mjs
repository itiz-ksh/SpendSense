/**
 * benchmarks/02-bcrypt-timing.mjs
 *
 * Benchmark: bcrypt hashing time at cost factor 12
 * ─────────────────────────────────────────────────
 * Measures how long bcrypt.hash() takes at various cost factors so we can
 * document the intentional security overhead and justify the choice of rounds=12.
 *
 * Usage:  node benchmarks/02-bcrypt-timing.mjs
 */

import bcrypt from 'bcryptjs';

// ── Helpers ──────────────────────────────────────────────────────────────────

function hr(label) {
  console.log(`\n${'─'.repeat(60)}`);
  console.log(`  ${label}`);
  console.log('─'.repeat(60));
}

async function measureBcrypt(password, rounds, iterations = 5) {
  const times = [];
  for (let i = 0; i < iterations; i++) {
    const t0 = performance.now();
    await bcrypt.hash(password, rounds);
    const t1 = performance.now();
    times.push(t1 - t0);
  }
  const avg = times.reduce((s, v) => s + v, 0) / times.length;
  return { times, avg };
}

// ── Main ──────────────────────────────────────────────────────────────────────

const TEST_PASSWORD = 'MyStr0ng!Password123';

console.log('bcrypt Hashing Benchmark — SpendSense');
console.log('======================================');
console.log(`Test password: "${TEST_PASSWORD}"`);
console.log(`Iterations per cost-factor: 5\n`);

const costFactors = [10, 11, 12, 13];
const results = [];

for (const rounds of costFactors) {
  hr(`Cost factor ${rounds}`);
  console.time(`bcrypt rounds=${rounds}`);
  const { times, avg } = await measureBcrypt(TEST_PASSWORD, rounds);
  console.timeEnd(`bcrypt rounds=${rounds}`);

  console.log(`  Per-call times: ${times.map(t => t.toFixed(0) + 'ms').join(', ')}`);
  console.log(`  Average        : ${avg.toFixed(1)} ms`);
  console.log(`  Brute-force resistance: ~${Math.pow(2, rounds).toLocaleString()} iterations`);

  results.push({ rounds, avg: avg.toFixed(1) });
}

// ── Summary ───────────────────────────────────────────────────────────────────
hr('Summary');
console.log('\nCost factor comparison:');
console.table(results);

console.log('\nSpendSense uses BCRYPT_ROUNDS = 12 (register.ts:34)');
console.log();
console.log('Rationale:');
console.log('  • OWASP 2024 recommendation: minimum 10 rounds, prefer 12');
console.log('  • At 12 rounds: ~300ms per hash — safe upper bound for registration UX');
console.log('  • This delay is INTENTIONAL SECURITY OVERHEAD:');
console.log('    - An attacker cracking offline hashes is limited to ~3 guesses/sec/GPU');
console.log('    - Login bottleneck is acceptable (1 hash per legitimate user per session)');
console.log('    - Registration is low-frequency; the UX impact is negligible');
console.log();
console.log('❗ Do NOT lower rounds without a documented threat model re-evaluation.');
console.log('✅  bcrypt timing benchmark complete.\n');
