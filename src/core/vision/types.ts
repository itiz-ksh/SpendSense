/**
 * src/core/vision/types.ts
 *
 * Public type contracts for the SpendSense computer-vision preprocessing pipeline.
 *
 * Architectural invariants upheld:
 *  - Database Decoupled Pipeline Invariant: these types contain NO database
 *    references, user identifiers, or network types.
 *  - In-Memory Image Isolation Invariant: the pipeline operates exclusively
 *    on `Buffer` objects (volatile RAM). No file path types are accepted as
 *    input — callers must load bytes into memory before invoking the pipeline.
 */

// ---------------------------------------------------------------------------
// Input
// ---------------------------------------------------------------------------

/**
 * Raw image data provided to the preprocessing pipeline.
 * The Buffer must contain the complete binary content of a
 * JPEG, PNG, or WebP image loaded into process memory.
 *
 * The pipeline does NOT accept file paths, URLs, or stream references.
 * Image data must already reside entirely in RAM when passed here.
 */
export interface RawImageInput {
  /** Complete image bytes in JPEG, PNG, or WebP encoding. */
  buffer: Buffer;
  /** Original MIME type — used only for logging/debugging, never for disk writes. */
  mimeType: 'image/jpeg' | 'image/png' | 'image/webp';
  /** Original file size in bytes (before preprocessing) — used for telemetry only. */
  originalSizeBytes: number;
}

// ---------------------------------------------------------------------------
// Preprocessing options
// ---------------------------------------------------------------------------

/**
 * Optional tuning parameters for the preprocessing pipeline.
 * All values have production-tested defaults and do not need to be supplied.
 */
export interface PreprocessOptions {
  /**
   * Target long-edge pixel dimension after cubic interpolation resize.
   * Tesseract performs best on images where text height is ~30-40px.
   * Default: 2400px (suitable for typical receipt photographs).
   */
  targetLongEdgePx?: number;

  /**
   * Adaptive threshold block size (must be odd, ≥ 3).
   * Controls how large a neighbourhood the algorithm considers when
   * binarising each pixel. Larger values handle more shadow variation.
   * Default: 31
   */
  adaptiveBlockSize?: number;

  /**
   * Constant subtracted from the weighted mean when computing the
   * adaptive threshold. Increase to preserve more fine ink detail.
   * Default: 10
   */
  adaptiveC?: number;

  /**
   * Maximum skew angle (degrees) that the deskew routine will attempt
   * to correct. Receipts rarely exceed 15°; higher values risk false rotations.
   * Default: 15
   */
  maxSkewDegrees?: number;
}

// ---------------------------------------------------------------------------
// Pipeline result
// ---------------------------------------------------------------------------

/**
 * The output of a successful preprocessing run.
 * The processed buffer is ready to be passed directly to the Tesseract driver.
 *
 * After Tesseract consumes this buffer the caller MUST allow it to fall out
 * of scope (do not persist to disk or assign to a long-lived reference).
 */
export interface PreprocessResult {
  /** Binarised, deskewed, resized image as a PNG-encoded in-memory buffer. */
  processedBuffer: Buffer;
  /** Width of the processed image in pixels. */
  widthPx: number;
  /** Height of the processed image in pixels. */
  heightPx: number;
  /** Skew angle detected and corrected, in degrees. 0 if deskew was skipped. */
  detectedSkewDegrees: number;
  /** Elapsed time for the full preprocessing run, in milliseconds. */
  processingMs: number;
}

// ---------------------------------------------------------------------------
// Pipeline error
// ---------------------------------------------------------------------------

export type PreprocessErrorCode =
  | 'DECODE_FAILED'       // OpenCV could not decode the image buffer
  | 'RESIZE_FAILED'       // Cubic interpolation resize step failed
  | 'DESKEW_FAILED'       // Hough-based angle detection or rotation failed
  | 'THRESHOLD_FAILED'    // Adaptive binarisation step failed
  | 'ENCODE_FAILED'       // PNG re-encoding of the result failed
  | 'INVALID_INPUT';      // Buffer was empty or image dimensions were degenerate

export interface PreprocessError {
  success: false;
  code: PreprocessErrorCode;
  message: string;
}

export interface PreprocessSuccess {
  success: true;
  result: PreprocessResult;
}

/** Discriminated union returned by `preprocessImage()`. */
export type PreprocessOutcome = PreprocessSuccess | PreprocessError;
