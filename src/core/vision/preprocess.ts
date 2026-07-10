/**
 * src/core/vision/preprocess.ts
 *
 * SpendSense Computer Vision Preprocessing Pipeline (WASM/JS version)
 *
 * Transforms a raw receipt image Buffer through six sequential stages:
 *   1. Decode      — Load bytes into Jimp, then to an OpenCV Mat (volatile memory only)
 *   2. Grayscale   — Convert RGBA→GRAY to reduce noise and simplify thresholding
 *   3. Deskew      — Detect and correct text-layer skew via Hough line transform
 *   4. Resize      — Cubic interpolation to Tesseract-optimal resolution
 *   5. Binarise    — Adaptive Gaussian threshold to produce clean black/white output
 *   6. Encode      — Re-encode result as PNG Buffer using Jimp
 *
 * ─── Architectural Invariants ────────────────────────────────────────────────
 *  • Database Decoupled Pipeline Invariant: this module has ZERO imports from
 *    `src/data/` or `src/api/`. It receives a Buffer and returns a Buffer.
 *  • In-Memory Image Isolation Invariant: no `fs.writeFile`, `fs.createWriteStream`,
 *    or any other disk-write call exists in this file. All OpenCV Mats are
 *    local variables that are released explicitly before the function returns.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import * as cvTypes from '@techstark/opencv-js';
// Use require to get a mutable object, as `import * as` creates a frozen module in Next.js
const cv = require('@techstark/opencv-js') as typeof cvTypes;
import { Jimp } from 'jimp';
import type {
  RawImageInput,
  PreprocessOptions,
  PreprocessOutcome,
  PreprocessResult,
} from './types';

// ---------------------------------------------------------------------------
// OpenCV Initialization Helper
// ---------------------------------------------------------------------------

let cvReady: Promise<void> | null = null;
function getCvReady(): Promise<void> {
  if (cvReady) return cvReady;
  
  if (typeof cv.Mat === 'function') {
    cvReady = Promise.resolve();
  } else {
    cvReady = new Promise<void>((resolve) => {
      Object.assign(cv, { onRuntimeInitialized: () => resolve() });
    });
  }
  return cvReady;
}

// ---------------------------------------------------------------------------
// Default tuning constants
// ---------------------------------------------------------------------------

const DEFAULT_TARGET_LONG_EDGE_PX = 2400;
const DEFAULT_ADAPTIVE_BLOCK_SIZE = 31;
const DEFAULT_ADAPTIVE_C = 10;
const DEFAULT_MAX_SKEW_DEGREES = 15;

/**
 * Minimum number of pixels on the long edge required to proceed.
 */
const MIN_LONG_EDGE_PX = 200;

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function toRadians(degrees: number): number {
  return (degrees * Math.PI) / 180;
}

/**
 * Estimate the dominant skew angle using Probabilistic Hough Transform.
 */
function detectSkewAngle(gray: cvTypes.Mat, maxSkewDegrees: number): number {
  const edges = new cv.Mat();
  cv.Canny(gray, edges, 50, 150);

  const lines = new cv.Mat();
  cv.HoughLinesP(edges, lines, 1, Math.PI / 180, 80, 50, 10);

  edges.delete();

  if (lines.rows === 0) {
    lines.delete();
    return 0;
  }

  const angles: number[] = [];
  for (let i = 0; i < lines.rows; i++) {
    const x1 = lines.data32S[i * 4];
    const y1 = lines.data32S[i * 4 + 1];
    const x2 = lines.data32S[i * 4 + 2];
    const y2 = lines.data32S[i * 4 + 3];
    
    const dx = x2 - x1;
    const dy = y2 - y1;
    if (dx === 0) continue;

    const angleDeg = (Math.atan2(dy, dx) * 180) / Math.PI;
    if (Math.abs(angleDeg) <= maxSkewDegrees) {
      angles.push(angleDeg);
    }
  }

  lines.delete();

  if (angles.length === 0) return 0;

  angles.sort((a, b) => a - b);
  const mid = Math.floor(angles.length / 2);
  return angles.length % 2 === 0
    ? (angles[mid - 1] + angles[mid]) / 2
    : angles[mid];
}

/**
 * Rotate a Mat by `angleDegrees` around its centre without cropping.
 */
function rotateWithoutCrop(src: cvTypes.Mat, angleDegrees: number): cvTypes.Mat {
  const w = src.cols;
  const h = src.rows;
  const centre = new cv.Point(w / 2, h / 2);

  const rotMat = cv.getRotationMatrix2D(centre, angleDegrees, 1.0);

  const angleRad = toRadians(angleDegrees);
  const cosA = Math.abs(Math.cos(angleRad));
  const sinA = Math.abs(Math.sin(angleRad));
  const newW = Math.round(h * sinA + w * cosA);
  const newH = Math.round(h * cosA + w * sinA);

  // Adjust translation to keep image centered
  // rotMat is a 2x3 matrix, data is Float64 (CV_64F) by default
  const dx = newW / 2 - centre.x;
  const dy = newH / 2 - centre.y;
  rotMat.data64F[2] += dx;
  rotMat.data64F[5] += dy;

  const rotated = new cv.Mat();
  cv.warpAffine(src, rotated, rotMat, new cv.Size(newW, newH), cv.INTER_CUBIC, cv.BORDER_REPLICATE);
  
  rotMat.delete();
  return rotated;
}

// ---------------------------------------------------------------------------
// Main exported pipeline function
// ---------------------------------------------------------------------------

export async function preprocessImage(
  input: RawImageInput,
  options: PreprocessOptions = {}
): Promise<PreprocessOutcome> {
  const startMs = Date.now();

  const targetLongEdge = options.targetLongEdgePx ?? DEFAULT_TARGET_LONG_EDGE_PX;
  const blockSize = options.adaptiveBlockSize ?? DEFAULT_ADAPTIVE_BLOCK_SIZE;
  const adaptiveC = options.adaptiveC ?? DEFAULT_ADAPTIVE_C;
  const maxSkew = options.maxSkewDegrees ?? DEFAULT_MAX_SKEW_DEGREES;
  const safeBlockSize = blockSize % 2 === 0 ? blockSize + 1 : Math.max(3, blockSize);

  if (!input.buffer || input.buffer.length === 0) {
    return { success: false, code: 'INVALID_INPUT', message: 'Image buffer is empty.' };
  }

  try {
    await getCvReady();

    // ── Stage 1: Decode via Jimp ──────────────────────────────────────────────
    let jimpImage;
    try {
      jimpImage = await Jimp.read(input.buffer);
    } catch (err: unknown) {
      return { success: false, code: 'DECODE_FAILED', message: `Jimp decode failed: ${err instanceof Error ? err.message : String(err)}` };
    }
    
    const { width: origW, height: origH, data: pixelData } = jimpImage.bitmap;

    if (Math.max(origW, origH) < MIN_LONG_EDGE_PX) {
      return { success: false, code: 'INVALID_INPUT', message: `Image is too small (${origW}×${origH}px). Minimum long edge is ${MIN_LONG_EDGE_PX}px.` };
    }

    const srcMat = new cv.Mat(origH, origW, cv.CV_8UC4);
    srcMat.data.set(pixelData);

    // ── Stage 2: Grayscale conversion ─────────────────────────────────────────
    const grayMat = new cv.Mat();
    cv.cvtColor(srcMat, grayMat, cv.COLOR_RGBA2GRAY);
    srcMat.delete();

    // ── Stage 3: Deskew ───────────────────────────────────────────────────────
    let detectedSkewDegrees = 0;
    let deskewedMat = grayMat;
    
    detectedSkewDegrees = detectSkewAngle(grayMat, maxSkew);
    if (Math.abs(detectedSkewDegrees) > 0.1) {
      deskewedMat = rotateWithoutCrop(grayMat, -detectedSkewDegrees);
      grayMat.delete();
    }

    // ── Stage 4: Resize (cubic interpolation) ─────────────────────────────────
    let resizedMat = deskewedMat;
    const { cols: dw, rows: dh } = deskewedMat;
    const longEdge = Math.max(dw, dh);

    if (longEdge !== targetLongEdge) {
      const scale = targetLongEdge / longEdge;
      const newW = Math.round(dw * scale);
      const newH = Math.round(dh * scale);
      resizedMat = new cv.Mat();
      cv.resize(deskewedMat, resizedMat, new cv.Size(newW, newH), 0, 0, cv.INTER_CUBIC);
      deskewedMat.delete();
    }

    // ── Stage 5: Adaptive Gaussian Binarisation ───────────────────────────────
    const binaryMat = new cv.Mat();
    cv.adaptiveThreshold(
      resizedMat,
      binaryMat,
      255,
      cv.ADAPTIVE_THRESH_GAUSSIAN_C,
      cv.THRESH_BINARY,
      safeBlockSize,
      adaptiveC
    );
    resizedMat.delete();

    // ── Stage 6: Encode result as PNG Buffer ──────────────────────────────────
    const rgbaMat = new cv.Mat();
    cv.cvtColor(binaryMat, rgbaMat, cv.COLOR_GRAY2RGBA);
    
    const outImage = new Jimp({
      width: rgbaMat.cols,
      height: rgbaMat.rows,
      data: Buffer.from(rgbaMat.data)
    });
    
    const processedBuffer = await outImage.getBuffer('image/png');
    
    const finalW = binaryMat.cols;
    const finalH = binaryMat.rows;

    binaryMat.delete();
    rgbaMat.delete();

    const result: PreprocessResult = {
      processedBuffer,
      widthPx: finalW,
      heightPx: finalH,
      detectedSkewDegrees,
      processingMs: Date.now() - startMs,
    };

    return { success: true, result };
  } catch (err: unknown) {
    return {
      success: false,
      code: 'INVALID_INPUT',
      message: `Vision pipeline error: ${err instanceof Error ? err.message : String(err)}`
    };
  }
}
