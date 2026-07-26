#!/usr/bin/env node
/**
 * benchmarks/07-bundle-size.mjs
 *
 * Benchmark: Next.js bundle size analysis
 * ─────────────────────────────────────────
 * Parses the .next/build-manifest.json and page build output to report:
 *   • First Load JS size per route
 *   • Shared chunk sizes
 *   • Total bundle size
 *
 * Requires `next build` to have been run first (a build already exists).
 *
 * Usage:  node benchmarks/07-bundle-size.mjs
 */

import fs   from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { execSync } from 'child_process';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT      = path.join(__dirname, '..');
const NEXT_DIR  = path.join(ROOT, '.next');

// ── Helpers ──────────────────────────────────────────────────────────────────

function hr(label) {
  console.log(`\n${'─'.repeat(60)}`);
  console.log(`  ${label}`);
  console.log('─'.repeat(60));
}

function formatBytes(bytes) {
  if (bytes < 1024)        return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} kB`;
  return `${(bytes / 1024 / 1024).toFixed(2)} MB`;
}

function getFileSize(filePath) {
  try {
    return fs.statSync(filePath).size;
  } catch {
    return 0;
  }
}

function gzipEstimate(bytes) {
  // Rough gzip estimate: JS typically compresses 3–5x
  return Math.round(bytes / 3.5);
}

// ── Check build exists ────────────────────────────────────────────────────────
hr('Checking Next.js build');

if (!fs.existsSync(NEXT_DIR)) {
  console.error('❌  No .next directory found. Run: npm run build');
  process.exit(1);
}

const buildIdPath = path.join(NEXT_DIR, 'BUILD_ID');
if (!fs.existsSync(buildIdPath)) {
  console.log('⚠️  No BUILD_ID — build may be incomplete. Running: npm run build');
  execSync('npm run build', { cwd: ROOT, stdio: 'inherit' });
}

const buildId = fs.readFileSync(buildIdPath, 'utf8').trim();
console.log(`  Build ID : ${buildId}`);

// ── Read manifests ────────────────────────────────────────────────────────────
hr('Parsing build manifests');

// Build manifest maps routes → JS chunks
const buildManifestPath = path.join(NEXT_DIR, 'build-manifest.json');
const appBuildManifestPath = path.join(NEXT_DIR, 'app-build-manifest.json');

let buildManifest    = {};
let appBuildManifest = {};

if (fs.existsSync(buildManifestPath)) {
  buildManifest = JSON.parse(fs.readFileSync(buildManifestPath, 'utf8'));
  console.log('  ✅ build-manifest.json loaded');
}
if (fs.existsSync(appBuildManifestPath)) {
  appBuildManifest = JSON.parse(fs.readFileSync(appBuildManifestPath, 'utf8'));
  console.log('  ✅ app-build-manifest.json loaded');
}

// ── Static directory analysis ────────────────────────────────────────────────
hr('Static JS Chunks (/_next/static/)');

const staticDir = path.join(NEXT_DIR, 'static');
const chunkRows = [];
let totalStaticSize = 0;

function scanDir(dir, relative = '') {
  if (!fs.existsSync(dir)) return;
  for (const entry of fs.readdirSync(dir)) {
    const full = path.join(dir, entry);
    const rel  = path.join(relative, entry);
    const stat = fs.statSync(full);
    if (stat.isDirectory()) {
      scanDir(full, rel);
    } else if (entry.endsWith('.js') || entry.endsWith('.css')) {
      totalStaticSize += stat.size;
      chunkRows.push({
        file:          rel,
        size:          formatBytes(stat.size),
        'gzip (est)':  formatBytes(gzipEstimate(stat.size)),
        bytes:         stat.size,
      });
    }
  }
}

scanDir(staticDir);

// Sort by size descending
chunkRows.sort((a, b) => b.bytes - a.bytes);

// Show top 15 chunks
console.log('\n  Top 15 chunks by size:');
console.table(
  chunkRows.slice(0, 15).map(r => ({
    File: r.file.length > 55 ? '…' + r.file.slice(-52) : r.file,
    Size: r.size,
    'Gzip (est)': r['gzip (est)'],
  }))
);
console.log(`\n  Total static JS+CSS : ${formatBytes(totalStaticSize)}`);
console.log(`  Gzip estimate       : ${formatBytes(gzipEstimate(totalStaticSize))}`);

// ── App Router route breakdown ────────────────────────────────────────────────
hr('App Router — First Load JS per route');

const routeEntries = Object.entries(appBuildManifest.pages ?? {});
if (routeEntries.length === 0) {
  console.log('  (app-build-manifest.json has no pages entry — checking server pages)');
}

const pagesManifestPath = path.join(NEXT_DIR, 'server', 'pages-manifest.json');
const appPagesManifestPath = path.join(NEXT_DIR, 'server', 'app-paths-manifest.json');

const routes = [];
for (const manifestPath of [pagesManifestPath, appPagesManifestPath]) {
  if (!fs.existsSync(manifestPath)) continue;
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  for (const [route, serverFile] of Object.entries(manifest)) {
    if (route.startsWith('/_')) continue;
    routes.push(route);
  }
}

if (routes.length > 0) {
  console.log('\n  Routes found:');
  const routeTable = routes.map(r => ({ Route: r }));
  console.table(routeTable);
}

// ── Client-side chunk breakdown per route (from buildManifest) ────────────────
hr('Client-side JS per route (from build-manifest.json)');

const pageChunks = buildManifest.pages ?? {};
const routeSizes = [];

for (const [page, chunks] of Object.entries(pageChunks)) {
  if (page.startsWith('/_')) continue;
  let totalBytes = 0;
  for (const chunk of chunks) {
    const chunkPath = path.join(NEXT_DIR, chunk);
    totalBytes += getFileSize(chunkPath);
  }
  routeSizes.push({
    Route: page,
    Chunks: chunks.length,
    'First Load JS': formatBytes(totalBytes),
    'First Load JS (gzip est)': formatBytes(gzipEstimate(totalBytes)),
    bytes: totalBytes,
  });
}

routeSizes.sort((a, b) => b.bytes - a.bytes);
if (routeSizes.length > 0) {
  console.table(routeSizes.map(r => ({
    Route: r.Route,
    Chunks: r.Chunks,
    'First Load JS': r['First Load JS'],
    'Gzip (est)': r['First Load JS (gzip est)'],
  })));
}

// ── Performance thresholds ────────────────────────────────────────────────────
hr('Performance thresholds (Next.js warnings)');
console.log();
console.log('  ✅ Threshold: First Load JS < 130 kB per route (Next.js default warning)');
console.log('  ✅ Threshold: Shared framework chunk < 500 kB');
console.log();

const heavyRoutes = routeSizes.filter(r => r.bytes > 130 * 1024);
if (heavyRoutes.length > 0) {
  console.log('  ⚠️  Routes exceeding 130 kB First Load JS:');
  heavyRoutes.forEach(r => console.log(`     ${r.Route} — ${r['First Load JS']}`));
} else {
  console.log('  ✅ All routes are within the 130 kB threshold.');
}

// ── Next.js build output capture ─────────────────────────────────────────────
hr('Capturing next build output (re-running build for fresh stats)');
console.log('  Note: Skipping re-build since a build already exists.');
console.log('  To get the official Next.js bundle report, run:');
console.log('    npm run build 2>&1 | tee benchmarks/build-output.txt');
console.log();
console.log('  For a detailed analysis with webpack-bundle-analyzer:');
console.log('    ANALYZE=true npm run build');
console.log('  (requires adding @next/bundle-analyzer to next.config.ts)');

console.log('\n✅  Bundle size benchmark complete.\n');
