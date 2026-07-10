/**
 * src/core/ocr/tesseract.ts
 *
 * Local Tesseract OCR Driver.
 * Pipes in-memory image buffers directly to the local Tesseract binary
 * via stdin/stdout to maintain the zero disk I/O invariant.
 */

import { spawn } from 'child_process';
import type { OcrResult } from './types';

// ---------------------------------------------------------------------------
// Execution wrapper
// ---------------------------------------------------------------------------

/**
 * Spawns a local Tesseract process and feeds it the image buffer via stdin.
 * Uses --psm 4 (Assume a single column of text of variable sizes) which
 * is empirically the most accurate for structured receipts.
 */
export function runTesseract(imageBuffer: Buffer): Promise<OcrResult> {
  return new Promise((resolve, reject) => {
    const startMs = Date.now();
    
    // Spawn Tesseract CLI. 
    // `stdin stdout` tells it to read from stdin and write to stdout.
    const tesseract = spawn('tesseract', ['stdin', 'stdout', '-l', 'eng', '--psm', '4']);

    let stdoutData = '';
    let stderrData = '';

    tesseract.stdout.on('data', (data: Buffer) => {
      stdoutData += data.toString('utf8');
    });

    tesseract.stderr.on('data', (data: Buffer) => {
      stderrData += data.toString('utf8');
    });

    tesseract.on('close', (code) => {
      if (code !== 0) {
        reject(new Error(`Tesseract exited with code ${code}. Stderr: ${stderrData.trim()}`));
      } else {
        resolve({
          text: stdoutData.trim(),
          processingMs: Date.now() - startMs,
        });
      }
    });

    tesseract.on('error', (err) => {
      reject(new Error(`Failed to start tesseract process: ${err.message}`));
    });

    // Write the raw image buffer (e.g. PNG bytes) to stdin, then close it
    // so Tesseract knows the file is complete and begins processing.
    tesseract.stdin.write(imageBuffer);
    tesseract.stdin.end();
  });
}

// ---------------------------------------------------------------------------
// TSV driver — returns word-level positional data
// ---------------------------------------------------------------------------

/**
 * Spawn Tesseract configured to emit TSV (tab-separated values) output.
 *
 * Tesseract TSV columns (0-indexed):
 *   0  level   1=page 2=block 3=para 4=line 5=word
 *   1  page_num
 *   2  block_num
 *   3  par_num
 *   4  line_num
 *   5  word_num
 *   6  left     (px from left edge)
 *   7  top      (px from top edge)
 *   8  width
 *   9  height
 *  10  conf     (0–100, -1 = non-text row)
 *  11  text
 *
 * We use --psm 6 (uniform block of text) which works better than psm 4
 * when we are doing our own line reconstruction from coordinates.
 */
export function runTesseractTsv(imageBuffer: Buffer): Promise<{ tsvText: string; processingMs: number }> {
  return new Promise((resolve, reject) => {
    const startMs = Date.now();

    const tesseract = spawn('tesseract', [
      'stdin', 'stdout',
      '-l', 'eng',
      '--psm', '6',
      'tsv',               // output type: TSV
    ]);

    let stdoutData = '';
    let stderrData = '';

    tesseract.stdout.on('data', (data: Buffer) => {
      stdoutData += data.toString('utf8');
    });

    tesseract.stderr.on('data', (data: Buffer) => {
      stderrData += data.toString('utf8');
    });

    tesseract.on('close', (code) => {
      if (code !== 0) {
        reject(new Error(`Tesseract TSV exited with code ${code}. Stderr: ${stderrData.trim()}`));
      } else {
        resolve({ tsvText: stdoutData, processingMs: Date.now() - startMs });
      }
    });

    tesseract.on('error', (err) => {
      reject(new Error(`Failed to start tesseract process: ${err.message}`));
    });

    tesseract.stdin.write(imageBuffer);
    tesseract.stdin.end();
  });
}
