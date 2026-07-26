#!/usr/bin/env node
/**
 * benchmarks/run-all.mjs
 *
 * SpendSense Performance Benchmark Suite — Master Runner
 * ══════════════════════════════════════════════════════
 *
 * Executes all benchmarks in sequence and writes the combined output to
 * benchmarks/results/benchmark-report-<timestamp>.txt
 *
 * Usage:
 *   node benchmarks/run-all.mjs              # run all except load test
 *   node benchmarks/run-all.mjs --with-load  # also run autocannon load test
 */

import { execSync, spawnSync } from 'child_process';
import fs   from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const RESULTS   = path.join(__dirname, 'results');

if (!fs.existsSync(RESULTS)) fs.mkdirSync(RESULTS, { recursive: true });

const timestamp  = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
const reportFile = path.join(RESULTS, `benchmark-report-${timestamp}.txt`);
const stream     = fs.createWriteStream(reportFile, { flags: 'a' });

function log(msg = '') {
  process.stdout.write(msg + '\n');
  stream.write(msg + '\n');
}

function hr(label = '') {
  const line = '═'.repeat(60);
  log(`\n${line}`);
  if (label) log(`  ${label}`);
  log(line);
}

function runBenchmark(name, file, extraArgs = []) {
  hr(`Running: ${name}`);
  log(`  File: ${file}`);
  log(`  Time: ${new Date().toLocaleTimeString()}\n`);

  const result = spawnSync('node', [file, ...extraArgs], {
    cwd:      path.join(__dirname, '..'),
    encoding: 'utf8',
    timeout:  300_000, // 5 min max per benchmark
    env:      { ...process.env, FORCE_COLOR: '0' },
  });

  if (result.stdout) {
    log(result.stdout);
    stream.write(result.stdout);
  }
  if (result.stderr) {
    log('[stderr] ' + result.stderr);
  }
  if (result.status !== 0) {
    log(`\n❌  Benchmark exited with code ${result.status}`);
  } else {
    log(`\n✅  Benchmark completed.`);
  }
}

// ── Header ────────────────────────────────────────────────────────────────────
const RUN_LOAD = process.argv.includes('--with-load');

log('╔══════════════════════════════════════════════════════════╗');
log('║    SpendSense AI — Performance Benchmark Suite           ║');
log('║    Running all benchmarks…                               ║');
log('╚══════════════════════════════════════════════════════════╝');
log(`\nStarted    : ${new Date().toISOString()}`);
log(`Report to  : ${reportFile}`);
log(`Load test  : ${RUN_LOAD ? 'YES (--with-load)' : 'NO (use --with-load to include)'}`);

// ── Run benchmarks in order ───────────────────────────────────────────────────
runBenchmark('01 — SQLite Write Throughput',     path.join(__dirname, '01-sqlite-write-throughput.mjs'));
runBenchmark('02 — bcrypt Hashing Time',         path.join(__dirname, '02-bcrypt-timing.mjs'));
runBenchmark('03 — Database Query Timing',       path.join(__dirname, '03-db-query-timing.mjs'));
runBenchmark('04 — Zod Validation Overhead',     path.join(__dirname, '04-zod-validation-overhead.mjs'));
runBenchmark('06 — Event Loop Lag',              path.join(__dirname, '06-event-loop-lag.mjs'));
runBenchmark('07 — Bundle Size Analysis',        path.join(__dirname, '07-bundle-size.mjs'));

if (RUN_LOAD) {
  runBenchmark('05 — Autocannon Load Test (mock)', path.join(__dirname, '05-autocannon-load-test.mjs'));
}

// ── Footer ────────────────────────────────────────────────────────────────────
hr('All benchmarks complete');
log(`Finished   : ${new Date().toISOString()}`);
log(`Full report: ${reportFile}`);
log();
stream.end();
