/**
 * src/core/ocr/types.ts
 *
 * Type definitions for the OCR pipeline and parsing engine.
 */

import type { SystemCategory } from '@/data/types';

/**
 * A single line-item extracted by the TSV positional parser.
 * Represents one product/service row on a receipt.
 */
export interface LineItem {
  name: string;
  qty: number;
  price: number;
}

/**
 * Raw text output from Tesseract before regex parsing.
 * Includes optional TSV data when the upgraded driver is used.
 */
export interface OcrResult {
  /** Plain-text output (Tesseract default mode). */
  text: string;
  /** Raw TSV string from Tesseract's `tsv` output_type (populated by runTesseractTsv). */
  tsvText?: string;
  /** Structured line items parsed from the TSV (populated when tsvText is present). */
  lineItems?: LineItem[];
  processingMs: number;
}

/**
 * Parsed data points extracted from the raw OCR text.
 * Null values indicate the parser could not confidently extract that field.
 */
export interface ExtractedExpense {
  items: LineItem[];
  /** Matched system category based on merchant/item keywords. */
  category: SystemCategory | null;
  /** ISO 8601 date string (YYYY-MM-DD) if found on receipt. */
  date: string | null;
}

export type OcrOutcome =
  | { success: true; result: OcrResult; extracted: ExtractedExpense }
  | { success: false; code: 'OCR_FAILED' | 'PROCESS_SPAWN_FAILED'; message: string };
