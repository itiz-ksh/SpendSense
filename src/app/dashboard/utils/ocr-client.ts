/**
 * src/app/dashboard/utils/ocr-client.ts
 *
 * Client-side service to handle receipt uploading and OCR parsing.
 * Encapsulates FormData building, API fetching, and error normalization.
 */

import type { ExtractedExpense } from '@/core/ocr/types';
import type { ExpenseInput } from '@/api/schemas/expenses';

/**
 * Uploads a receipt image to the backend OCR endpoint and parses the response.
 *
 * @param file - The raw receipt image file (JPEG, PNG, WEBP).
 * @returns The extracted line items, date, and category.
 */
export async function uploadReceiptAndParse(file: File): Promise<ExtractedExpense> {
  const formData = new FormData();
  formData.append('receipt', file);

  const response = await fetch('/api/ocr', {
    method: 'POST',
    body: formData,
  });

  const body = await response.json();

  if (!response.ok) {
    throw new Error(body.error?.message || 'Failed to process receipt via OCR');
  }

  const extracted: ExtractedExpense = body.data;
  return extracted;
}
