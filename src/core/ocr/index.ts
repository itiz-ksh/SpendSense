/**
 * src/core/ocr/index.ts
 *
 * Public API surface for the SpendSense OCR module.
 *
 * Upgraded pipeline (v2):
 *  1. Run BOTH Tesseract modes in parallel:
 *       a. Plain-text  (--psm 4)  → used by the existing regex parser
 *       b. TSV positional (--psm 6 tsv) → used by the new line-item parser
 *  2. The TSV line-item parser is tried first for amount + description.
 *  3. The plain-text regex parser fills in date, category, and any
 *     fields the TSV parser could not confidently resolve.
 *  4. If the TSV spawn fails (e.g. older Tesseract version), the pipeline
 *     degrades gracefully to the original plain-text path — zero breaking change.
 */

import { runTesseract, runTesseractTsv } from './tesseract';
import { parseOcrText } from './parser';
import { parseTsvToLineItems } from './line-parser';
import type { OcrOutcome, ExtractedExpense, OcrResult, LineItem } from './types';

export type { OcrOutcome, ExtractedExpense, OcrResult, LineItem };

/**
 * Orchestrates the full OCR parsing layer (v2 — TSV-enhanced):
 *
 *  1. Runs Tesseract in plain-text AND TSV modes concurrently.
 *  2. Merges results: TSV-derived amount/description take precedence,
 *     regex-derived date/category fill in the rest.
 *  3. Attaches parsed `lineItems` to the OcrResult for downstream use.
 *
 * @param processedImageBuffer - PNG Buffer from `preprocessImage`.
 */
export async function extractReceiptData(processedImageBuffer: Buffer): Promise<OcrOutcome> {
  // ── 1. Run both Tesseract modes concurrently ──────────────────────────────
  const [plainResult, tsvResult] = await Promise.allSettled([
    runTesseract(processedImageBuffer),
    runTesseractTsv(processedImageBuffer),
  ]);

  // ── 2. Plain-text result is mandatory (same as v1) ────────────────────────
  if (plainResult.status === 'rejected') {
    const msg = plainResult.reason instanceof Error
      ? plainResult.reason.message
      : String(plainResult.reason);
    const code = msg.includes('Failed to start') ? 'PROCESS_SPAWN_FAILED' : 'OCR_FAILED';
    return { success: false, code, message: msg };
  }

  const plainText = plainResult.value.text;
  const totalMs   = plainResult.value.processingMs +
    (tsvResult.status === 'fulfilled' ? tsvResult.value.processingMs : 0);

  // ── 3. Parse plain text (existing regex engine — unchanged) ───────────────
  const regexExtracted = parseOcrText(plainText);

  // ── 4. Parse TSV positional data (new line-item engine) ───────────────────
  let lineItems: LineItem[] = [];
  let tsvText: string | undefined;

  if (tsvResult.status === 'fulfilled') {
    tsvText  = tsvResult.value.tsvText;
    lineItems = parseTsvToLineItems(tsvText);
  }
  // If TSV failed, lineItems stays empty → we fall back entirely to regex results below.

  // ── 5. Merge: Extracted array + global regex fallback ──────
  const extracted: ExtractedExpense = {
    items:       lineItems,
    // Date: regex only (coordinates don't help extract dates)
    date:        regexExtracted.date,
    // Category: keyword match on full plain text (unchanged)
    category:    regexExtracted.category,
  };

  // ── 6. Build result object ────────────────────────────────────────────────
  const result: OcrResult = {
    text:     plainText,
    tsvText,
    lineItems: lineItems.length > 0 ? lineItems : undefined,
    processingMs: totalMs,
  };

  return { success: true, result, extracted };
}
