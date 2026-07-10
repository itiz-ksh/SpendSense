/**
 * src/core/ocr/parser.ts
 *
 * Pattern Normalization Regex Engine for Tesseract output.
 */

import type { SystemCategory } from '@/data/types';

// ---------------------------------------------------------------------------
// Regex Patterns
// ---------------------------------------------------------------------------

// Matches standard date formats: YYYY-MM-DD, MM/DD/YYYY, MM-DD-YY
const DATE_REGEX = /\b((?:19|20)\d\d[-/]\d{1,2}[-/]\d{1,2}|\d{1,2}[-/]\d{1,2}[-/](?:19|20)?\d\d)\b/;

// Matches potential monetary amounts like $12.34, 12.34, 1,234.56
// Ignores standalone integers unless they are clearly amounts
const AMOUNT_REGEX = /(?:total|amount|due|balance|pay)?\s*[$£€]?\s*(\d{1,3}(?:[,]\d{3})*(?:\.\d{2}))/i;

// Fallback for any decimal number
const DECIMAL_REGEX = /\b(\d+\.\d{2})\b/g;

// Keywords for auto-categorization
const CATEGORY_KEYWORDS: Record<SystemCategory, RegExp> = {
  Food: /restaurant|cafe|coffee|food|burger|pizza|kitchen|bakery|diner|grill|bar|pub|grocery|market|mart|supermarket/i,
  Rent: /rent|lease|mortgage|utility|water|electric|power|internet|broadband|housing|apartment/i,
  Entertainment: /movie|cinema|theatre|ticket|concert|game|steam|playstation|xbox|netflix|hulu|spotify/i,
  Others: /./, // Fallback
};

// ---------------------------------------------------------------------------
// Extractor Functions
// ---------------------------------------------------------------------------

function extractAmount(text: string): number | null {
  // 1. Try explicit total line
  const lines = text.split('\n');
  for (const line of lines) {
    if (/total|amount due|balance/i.test(line)) {
      const match = line.match(AMOUNT_REGEX) || line.match(DECIMAL_REGEX);
      if (match) {
        // Remove commas and extract the numeric part
        const val = parseFloat(match[1] ? match[1].replace(/,/g, '') : match[0].replace(/,/g, ''));
        if (!isNaN(val) && val > 0) return val;
      }
    }
  }

  // 2. Fallback to the largest decimal number found on the receipt
  let maxAmount = 0;
  const matches = [...text.matchAll(DECIMAL_REGEX)];
  for (const match of matches) {
    const val = parseFloat(match[1].replace(/,/g, ''));
    if (!isNaN(val) && val > maxAmount) {
      maxAmount = val;
    }
  }

  return maxAmount > 0 ? maxAmount : null;
}

function extractDate(text: string): string | null {
  const match = text.match(DATE_REGEX);
  if (!match) return null;

  const rawDate = match[1].replace(/\//g, '-');
  
  // Try to normalize to YYYY-MM-DD
  try {
    const d = new Date(rawDate);
    if (!isNaN(d.getTime())) {
      return d.toISOString().split('T')[0];
    }
  } catch {
    // ignore
  }
  return null;
}

function extractMerchant(text: string): string | null {
  const lines = text.split('\n')
    .map(l => l.trim())
    .filter(l => l.length > 3 && !/^\d+$/.test(l)); // Filter out blank lines and pure numbers

  if (lines.length === 0) return null;

  // The first substantial line of a receipt is usually the merchant name
  for (const line of lines) {
    // Skip lines that look like dates, times, or generic headers
    if (DATE_REGEX.test(line)) continue;
    if (/(receipt|invoice|welcome|cashier|store|tel:|phone:)/i.test(line)) continue;
    
    // Return the first valid looking merchant name
    // Strip special characters and excessive spacing
    const cleaned = line.replace(/[^a-zA-Z0-9\s&'-]/g, '').replace(/\s+/g, ' ').trim();
    if (cleaned.length >= 3) {
      return cleaned;
    }
  }

  return null;
}

function guessCategory(text: string, merchant: string | null): SystemCategory {
  const searchSpace = `${merchant || ''} \n ${text}`;

  if (CATEGORY_KEYWORDS.Food.test(searchSpace)) return 'Food';
  if (CATEGORY_KEYWORDS.Rent.test(searchSpace)) return 'Rent';
  if (CATEGORY_KEYWORDS.Entertainment.test(searchSpace)) return 'Entertainment';
  
  return 'Others';
}

// ---------------------------------------------------------------------------
// Main Parser Entry
// ---------------------------------------------------------------------------

export interface RegexExtracted {
  amount: number | null;
  date: string | null;
  description: string | null;
  category: SystemCategory | null;
}

export function parseOcrText(rawText: string): RegexExtracted {
  const amount = extractAmount(rawText);
  const date = extractDate(rawText);
  const description = extractMerchant(rawText);
  const category = guessCategory(rawText, description);

  return {
    amount,
    date,
    description,
    category,
  };
}
