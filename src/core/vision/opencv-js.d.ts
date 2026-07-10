/**
 * src/core/vision/opencv-js.d.ts
 *
 * Minimal ambient type declaration for @techstark/opencv-js.
 */

declare module '@techstark/opencv-js' {
  export class Mat {
    constructor();
    constructor(rows: number, cols: number, type: number);
    
    readonly rows: number;
    readonly cols: number;
    readonly data: Uint8Array;
    readonly data32S: Int32Array;
    readonly data64F: Float64Array;

    delete(): void;
    channels(): number;
    type(): number;
  }

  export class Point {
    constructor(x: number, y: number);
    readonly x: number;
    readonly y: number;
  }

  export class Size {
    constructor(width: number, height: number);
    readonly width: number;
    readonly height: number;
  }

  export function getBuildInformation(): string;
  export var onRuntimeInitialized: () => void;

  export function cvtColor(src: Mat, dst: Mat, code: number): void;
  export function Canny(src: Mat, edges: Mat, threshold1: number, threshold2: number): void;
  export function HoughLinesP(image: Mat, lines: Mat, rho: number, theta: number, threshold: number, minLineLength: number, maxLineGap: number): void;
  export function getRotationMatrix2D(center: Point, angle: number, scale: number): Mat;
  export function warpAffine(src: Mat, dst: Mat, M: Mat, dsize: Size, flags: number, borderMode: number, borderValue?: any): void;
  export function resize(src: Mat, dst: Mat, dsize: Size, fx?: number, fy?: number, interpolation?: number): void;
  export function adaptiveThreshold(src: Mat, dst: Mat, maxValue: number, adaptiveMethod: number, thresholdType: number, blockSize: number, C: number): void;

  export const CV_8UC1: number;
  export const CV_8UC3: number;
  export const CV_8UC4: number;
  export const CV_32SC4: number;

  export const COLOR_RGBA2GRAY: number;
  export const COLOR_GRAY2RGBA: number;

  export const INTER_CUBIC: number;
  export const BORDER_REPLICATE: number;

  export const ADAPTIVE_THRESH_GAUSSIAN_C: number;
  export const THRESH_BINARY: number;
}
