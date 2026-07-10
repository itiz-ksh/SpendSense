/**
 * src/core/ocr/line-parser.ts
 *
 * Positional TSV → Line-Item Parser
 * ==================================
 *
 * Implements the upgraded receipt parsing pipeline:
 *
 *  1. Parse Tesseract TSV rows into typed Word objects (text, top, left, conf).
 *  2. Filter out low-confidence / empty words.
 *  3. Group words into "lines" using a pixel-proximity threshold on their
 *     `top` coordinates — words within LINE_THRESHOLD px of an existing
 *     line's anchor `top` are merged into that line.
 *  4. Reconstruct each line string by joining words sorted by `left`.
 *  5. Run a price regex on the end of each line string to extract `amount`.
 *     Strip the price from the line to produce `description`.
 *  6. Return `LineItem[]` — one object per priced line, sorted by position.
 *
 * The function is pure (no I/O, no side-effects) and is fully unit-testable.
 */

import type { LineItem } from './types';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/**
 * Words whose `top` values differ by ≤ LINE_THRESHOLD pixels are considered
 * to be on the same receipt row. 12px is empirically robust for 300-DPI scans
 * and camera photos preprocessed to ~2400px long edge.
 */
const LINE_THRESHOLD = 12;

/**
 * Minimum Tesseract confidence (0–100) to accept a word token.
 * Words below this threshold are typically garbage characters.
 */
const MIN_CONFIDENCE = 30;

/**
 * Price regex: matches a decimal number with exactly 2 decimal places,
 * optionally preceded by a currency symbol ($, £, €) and/or a comma
 * thousands separator.  Must appear at or near the END of the line string.
 *
 * Examples matched:
 *   "4.50"  "12.99"  "$4.50"  "1,234.56"  "£12.00"
 *
 * Capturing group 1: the numeric part (without currency symbol).
 */
const PRICE_REGEX = /[$£€]?\s*(\d{1,3}(?:[,]\d{3})*(?:[.]\d{2}))(?:\s*)$/;

/**
 * Alternative: comma-as-decimal-separator (European receipts).
 * e.g. "4,50" or "12,99"
 */
const PRICE_REGEX_COMMA_DECIMAL = /[$£€]?\s*(\d{1,3}(?:[.]\d{3})*(?:[,]\d{2}))(?:\s*)$/;

// ---------------------------------------------------------------------------
// Internal Types
// ---------------------------------------------------------------------------

interface TsvWord {
  level: number;
  left: number;
  top: number;
  width: number;
  height: number;
  conf: number;
  text: string;
}

interface LineGroup {
  /** The `top` pixel of the first word anchoring this group. */
  anchorTop: number;
  words: TsvWord[];
}

// ---------------------------------------------------------------------------
// Step 1 — Parse TSV rows into TsvWord objects
// ---------------------------------------------------------------------------

/**
 * Parse the raw TSV string emitted by `tesseract stdin stdout tsv`.
 *
 * Tesseract's TSV header row:
 *   level  page_num  block_num  par_num  line_num  word_num  left  top  width  height  conf  text
 *
 * We skip:
 *  - The header row itself (starts with "level")
 *  - Rows where level ≠ 5 (level 5 = individual word tokens)
 *  - Rows where conf = -1 (structure rows, not text)
 */
export function parseTsvRows(tsvText: string): TsvWord[] {
  const words: TsvWord[] = [];
  const lines = tsvText.split('\n');

  for (const line of lines) {
    // Skip empty lines and the header row
    if (!line.trim() || line.startsWith('level')) continue;

    const cols = line.split('\t');
    if (cols.length < 12) continue;

    const level = parseInt(cols[0], 10);
    if (level !== 5) continue;   // Only word-level rows

    const conf = parseInt(cols[10], 10);
    if (conf === -1) continue;   // Skip structure / non-text rows

    const text = cols[11]?.trim() ?? '';
    if (!text) continue;         // Skip blank tokens

    words.push({
      level,
      left:   parseInt(cols[6],  10),
      top:    parseInt(cols[7],  10),
      width:  parseInt(cols[8],  10),
      height: parseInt(cols[9],  10),
      conf,
      text,
    });
  }

  return words;
}

// ---------------------------------------------------------------------------
// Step 2 — Filter low-confidence and whitespace tokens
// ---------------------------------------------------------------------------

function filterWords(words: TsvWord[]): TsvWord[] {
  return words.filter(
    (w) =>
      w.conf >= MIN_CONFIDENCE &&
      w.text.trim().length > 0 &&
      // Reject tokens that are only punctuation/noise
      !/^[^\w$£€.,]+$/.test(w.text),
  );
}

// ---------------------------------------------------------------------------
// Step 3 — Group words by horizontal line proximity
// ---------------------------------------------------------------------------

/**
 * Greedy line grouping algorithm:
 *
 * For each incoming word (already sorted top→bottom, left→right):
 *  - Check all existing groups to see if this word's `top` is within
 *    LINE_THRESHOLD pixels of that group's `anchorTop`.
 *  - If yes → merge into the first matching group.
 *  - If no  → start a new group anchored at this word's `top`.
 *
 * This correctly handles slight vertical misalignment between words that
 * are visually on the same line (common in camera-captured receipts).
 */
function groupWordsIntoLines(words: TsvWord[]): LineGroup[] {
  // Sort words: top ascending, then left ascending within each row
  const sorted = [...words].sort((a, b) =>
    a.top !== b.top ? a.top - b.top : a.left - b.left,
  );

  const groups: LineGroup[] = [];

  for (const word of sorted) {
    // Find an existing group whose anchorTop is within the threshold
    const match = groups.find(
      (g) => Math.abs(word.top - g.anchorTop) <= LINE_THRESHOLD,
    );

    if (match) {
      match.words.push(word);
    } else {
      groups.push({ anchorTop: word.top, words: [word] });
    }
  }

  // Within each group, sort words left→right to preserve reading order
  for (const g of groups) {
    g.words.sort((a, b) => a.left - b.left);
  }

  // Sort groups top→bottom
  groups.sort((a, b) => a.anchorTop - b.anchorTop);

  return groups;
}

// ---------------------------------------------------------------------------
// Step 4 & 5 — Reconstruct line string and extract price via regex
// ---------------------------------------------------------------------------

/**
 * Normalise a raw price string to a JavaScript float.
 * Handles:
 *  - "4.50"       → 4.50
 *  - "1,234.56"   → 1234.56  (US format, comma as thousands sep)
 *  - "1.234,56"   → 1234.56  (EU format, dot as thousands sep)
 */
function parsePrice(raw: string): number {
  // Detect European format: digits.digits,digits (e.g. "1.234,56")
  if (/\\d\\.\\d{3},\\d{2}$/.test(raw)) {
    return parseFloat(raw.replace(/\\./g, '').replace(',', '.'));
  }
  // US format (or plain decimal): remove commas then parse
  return parseFloat(raw.replace(/,/g, ''));
}

/**
 * Given a single reconstructed line string, extract the trailing price and
 * the preceding description text.
 *
 * Returns null if no price is found on this line.
 */
function extractLineItem(lineStr: string): LineItem | null {
  let trimmed = lineStr.trim();

  // Try period-as-decimal first (most common)
  let priceMatch = trimmed.match(PRICE_REGEX);
  let isCommaDecimal = false;

  if (!priceMatch) {
    priceMatch = trimmed.match(PRICE_REGEX_COMMA_DECIMAL);
    isCommaDecimal = true;
  }

  if (!priceMatch || !priceMatch[1]) return null;

  const rawPrice = priceMatch[1];
  const price = isCommaDecimal
    ? parseFloat(rawPrice.replace(/\\./g, '').replace(',', '.'))
    : parsePrice(rawPrice);

  if (isNaN(price) || price <= 0) return null;

  // Description = line text with the matched price (and its currency prefix) removed
  const matchedFull = priceMatch[0]; // includes possible $ prefix and trailing space
  let remainder = trimmed
    .slice(0, trimmed.length - matchedFull.length)
    .replace(/[$£€]\\s*$/, '')   // strip a trailing currency symbol with no number
    .trim();

  if (!remainder || /^\\d+$/.test(remainder)) return null;

  // Strip unit price if it exists (looks like another price at the end)
  let unitPriceMatch = remainder.match(PRICE_REGEX) || remainder.match(PRICE_REGEX_COMMA_DECIMAL);
  if (unitPriceMatch) {
    remainder = remainder.slice(0, remainder.length - unitPriceMatch[0].length).trim();
  }

  // Strip optional quantity if it exists at the end (looks like an integer)
  let qty = 1;
  const qtyMatch = remainder.match(/(?:\\s|^)[xX]?(\\d+)[xX]?$/i);
  if (qtyMatch) {
    qty = parseInt(qtyMatch[1], 10);
    remainder = remainder.slice(0, remainder.length - qtyMatch[0].length).trim();
  }

  // Clean the name: collapse whitespace, strip leading noise chars
  let name = remainder.replace(/\\s+/g, ' ').replace(/^[^a-zA-Z0-9]+/, '').trim();

  const NOISE_RE = /total|subtotal|tax|gst|vat|discount|change|cash|card|tip|visa|mastercard|balance|amount/i;
  if (NOISE_RE.test(name)) return null;

  if (name.length < 2) return null;

  return { name, qty, price };
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * `parseTsvToLineItems`
 *
 * The primary export of this module. Converts a raw Tesseract TSV string into
 * a clean, structured array of receipt line items.
 *
 * Pipeline:
 *   TSV string
 *     → parseTsvRows()      — typed word objects
 *     → filterWords()       — drop low-confidence noise
 *     → groupWordsIntoLines() — horizontal line reconstruction
 *     → reconstructed line strings
 *     → extractLineItem()   — price regex per line
 *     → LineItem[]
 *
 * @param tsvText - Raw TSV string from `runTesseractTsv()`.
 * @returns Array of `{ description, amount }` objects, one per priced line.
 *          Empty array if no priced lines are found (never throws).
 *
 * @example
 * const items = parseTsvToLineItems(tsv);
 * // → [
 * //     { description: "Organic Whole Milk", amount: 4.50 },
 * //     { description: "Sourdough Bread",    amount: 2.99 },
 * //     { description: "Total",              amount: 7.49 },
 * //   ]
 */
export function parseTsvToLineItems(tsvText: string): LineItem[] {
  try {
    const allWords = parseTsvRows(tsvText);
    const goodWords = filterWords(allWords);

    if (goodWords.length === 0) return [];

    const lineGroups = groupWordsIntoLines(goodWords);

    const lineItems: LineItem[] = [];
    let lastUnpricedLine: { text: string, top: number } | null = null;

    for (const group of lineGroups) {
      // Reconstruct line text by joining words in left→right order
      const lineStr = group.words.map((w) => w.text).join(' ');
      const item = extractLineItem(lineStr);
      if (item) {
        if (lastUnpricedLine && group.anchorTop - lastUnpricedLine.top < 60) {
           item.name = lastUnpricedLine.text + ' ' + item.name;
           item.name = item.name.trim();
        }
        lineItems.push(item);
        lastUnpricedLine = null;
      } else {
        const cleanStr = lineStr.replace(/[^a-zA-Z0-9 ]/g, '').trim();
        if (cleanStr.length > 2 && !/total|subtotal|tax|gst|vat|discount|change|cash|card|tip/i.test(cleanStr)) {
          lastUnpricedLine = { text: cleanStr, top: group.anchorTop };
        } else {
          lastUnpricedLine = null;
        }
      }
    }

    return lineItems;
  } catch {
    // Never crash the OCR pipeline
    return [];
  }
}
