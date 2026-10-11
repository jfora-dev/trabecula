import { CtVolume, huToStored } from './volume';

export type SliceAxis = 'axial' | 'coronal' | 'sagittal';

/** Grey-scale window in Hounsfield units, as on any CT workstation. */
export interface WindowLevel {
  center: number;
  width: number;
}

export const WINDOW_PRESETS = {
  bone: { center: 500, width: 2000 },
  softTissue: { center: 50, width: 450 },
} as const satisfies Record<string, WindowLevel>;

export interface SliceLayout {
  /** Image size in voxels. */
  width: number;
  height: number;
  /** Number of slices along this axis. */
  count: number;
  /** Displayed width / height in millimetres, for the aspect ratio. */
  widthMm: number;
  heightMm: number;
  /** Index (0 = x, 1 = y, 2 = z) of the grid axis this stack runs along. */
  normalAxis: 0 | 1 | 2;
}

const OVERLAY: readonly [number, number, number] = [150, 118, 255];
const OVERLAY_ALPHA = 0.5;

export function sliceLayout(volume: CtVolume, axis: SliceAxis): SliceLayout {
  const [nx, ny, nz] = volume.dims;
  const [sx, sy, sz] = volume.spacing;
  switch (axis) {
    case 'axial':
      return {
        width: nx,
        height: ny,
        count: nz,
        widthMm: nx * sx,
        heightMm: ny * sy,
        normalAxis: 2,
      };
    case 'coronal':
      return {
        width: nx,
        height: nz,
        count: ny,
        widthMm: nx * sx,
        heightMm: nz * sz,
        normalAxis: 1,
      };
    case 'sagittal':
      return {
        width: ny,
        height: nz,
        count: nx,
        widthMm: ny * sy,
        heightMm: nz * sz,
        normalAxis: 0,
      };
  }
}

/** Position of a slice along its axis, in millimetres. */
export function slicePositionMm(volume: CtVolume, axis: SliceAxis, index: number): number {
  const a = sliceLayout(volume, axis).normalAxis;
  return volume.origin[a] + index * volume.spacing[a];
}

/**
 * Paints one slice into an RGBA buffer of `layout.width * layout.height` pixels.
 *
 * Axial slices show volar at the top. Coronal and sagittal slices are flipped so that distal
 * is at the top, the way the bone is shown in the 3D view. Voxels at or above
 * `overlayThresholdHu` are tinted, which previews what the surface extraction will keep.
 */
export function renderSlice(
  volume: CtVolume,
  axis: SliceAxis,
  index: number,
  window: WindowLevel,
  overlayThresholdHu: number | null,
  out: Uint8ClampedArray,
): void {
  const { data } = volume;
  const [nx, ny, nz] = volume.dims;
  const { width, height, count } = sliceLayout(volume, axis);
  if (out.length !== width * height * 4) {
    throw new RangeError(`expected a buffer of ${width * height * 4} bytes, got ${out.length}`);
  }
  const slice = Math.min(Math.max(Math.round(index), 0), count - 1);

  // Work in stored values so the inner loop is one multiply-add per pixel.
  const low = huToStored(volume, window.center - window.width / 2);
  const high = huToStored(volume, window.center + window.width / 2);
  const scale = 255 / (high - low);
  const threshold = overlayThresholdHu === null ? Infinity : huToStored(volume, overlayThresholdHu);

  let o = 0;
  for (let row = 0; row < height; row++) {
    for (let col = 0; col < width; col++) {
      let stored: number;
      if (axis === 'axial') {
        stored = data[(slice * ny + row) * nx + col];
      } else if (axis === 'coronal') {
        stored = data[((nz - 1 - row) * ny + slice) * nx + col];
      } else {
        stored = data[((nz - 1 - row) * ny + col) * nx + slice];
      }
      const grey = (stored - low) * scale; // the clamped array takes care of the range
      if (stored >= threshold) {
        out[o] = grey + (OVERLAY[0] - grey) * OVERLAY_ALPHA;
        out[o + 1] = grey + (OVERLAY[1] - grey) * OVERLAY_ALPHA;
        out[o + 2] = grey + (OVERLAY[2] - grey) * OVERLAY_ALPHA;
      } else {
        out[o] = out[o + 1] = out[o + 2] = grey;
      }
      out[o + 3] = 255;
      o += 4;
    }
  }
}
