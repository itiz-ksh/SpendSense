/**
 * src/core/vision/index.ts
 *
 * Public API surface for the SpendSense computer-vision preprocessing module.
 *
 * Only `preprocessImage` and the type contracts are exported.
 * Internal helpers (detectSkewAngle, rotateWithoutCrop) remain private
 * to `preprocess.ts` and are not accessible outside this module.
 */

export { preprocessImage } from './preprocess';

export type {
  RawImageInput,
  PreprocessOptions,
  PreprocessResult,
  PreprocessOutcome,
  PreprocessSuccess,
  PreprocessError,
  PreprocessErrorCode,
} from './types';
