/**
 * src/app/api/ocr/route.ts
 *
 * Synchronous Multipart Form OCR Processing Endpoint.
 *
 * Receives a raw image stream, buffers it in memory, pushes it through the
 * OpenCV vision preprocessing pipeline, extracts text via the local Tesseract
 * OCR driver, and returns a sanitized JSON array formatted for expense creation.
 *
 * Architectural Invariants:
 *  - Memory Only: No disk writes. The file stream is consumed directly into a Buffer.
 *  - Authentication: Bound strictly by `verifySession`.
 */

import { type NextRequest } from 'next/server';
import { verifySession, errorResponse, successResponse } from '@/api/middleware/auth';
import { preprocessImage } from '@/core/vision';
import { extractReceiptData } from '@/core/ocr';
import type { ExtractedExpense } from '@/core/ocr/types';

export async function POST(request: NextRequest) {
  try {
    // 1. Authentication Boundary
    await verifySession(request);

    // 2. Parse Multipart Form Data
    let formData: FormData;
    try {
      formData = await request.formData();
    } catch {
      return errorResponse(400, 'BAD_REQUEST_MULTIPART', 'Invalid multipart/form-data payload');
    }

    const file = formData.get('receipt');
    if (!file || !(file instanceof File)) {
      return errorResponse(400, 'BAD_REQUEST_VALIDATION', 'Missing or invalid "receipt" file in form data');
    }

    // 3. Buffer the file stream entirely in memory (Zero Disk I/O Invariant)
    const arrayBuffer = await file.arrayBuffer();
    const imageBuffer = Buffer.from(arrayBuffer);

    if (imageBuffer.length === 0) {
      return errorResponse(400, 'BAD_REQUEST_VALIDATION', 'The uploaded receipt file is empty');
    }

    const mimeType = file.type;
    if (mimeType !== 'image/jpeg' && mimeType !== 'image/png' && mimeType !== 'image/webp') {
      return errorResponse(400, 'BAD_REQUEST_VALIDATION', 'Unsupported image format. Allowed formats: JPEG, PNG, WEBP');
    }

    // 4. Execute Core Vision Pipeline
    const preprocessOutcome = await preprocessImage(
      { 
        buffer: imageBuffer, 
        mimeType, 
        originalSizeBytes: file.size 
      }, 
      { targetLongEdgePx: 2400 }
    );
    
    if (!preprocessOutcome.success) {
      return errorResponse(500, 'VISION_PIPELINE_ERROR', preprocessOutcome.message);
    }

    // 5. Execute OCR Extraction Engine
    const ocrOutcome = await extractReceiptData(preprocessOutcome.result.processedBuffer);

    if (!ocrOutcome.success) {
      return errorResponse(500, ocrOutcome.code, ocrOutcome.message);
    }

    // 6. Return Structured Output
    return successResponse<ExtractedExpense>(ocrOutcome.extracted, 200);

  } catch (err: unknown) {
    if (typeof err === 'object' && err !== null && 'status' in err && 'code' in err && 'message' in err) {
      const typedErr = err as { status: number; code: string; message: string };
      return errorResponse(typedErr.status, typedErr.code, typedErr.message);
    }
    
    console.error('[POST /api/ocr] Internal Server Error:', err);
    return errorResponse(500, 'INTERNAL_SERVER_ERROR', 'An unexpected error occurred during OCR processing');
  }
}
