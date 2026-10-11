export type Vec3 = readonly [number, number, number];

/**
 * A regular scalar grid in millimetre space.
 *
 * `data` is laid out like DICOM pixel data stacked along z: x runs fastest, then y, then z.
 * The centre of voxel (i, j, k) is at `origin + (i, j, k) * spacing`.
 */
export interface ScalarGrid {
  readonly data: Int16Array;
  readonly dims: Vec3;
  readonly spacing: Vec3;
  readonly origin: Vec3;
}

/** A CT volume: a grid of stored values plus the DICOM-style mapping to Hounsfield units. */
export interface CtVolume extends ScalarGrid {
  readonly rescaleSlope: number;
  readonly rescaleIntercept: number;
}

export function storedToHu(volume: CtVolume, stored: number): number {
  return stored * volume.rescaleSlope + volume.rescaleIntercept;
}

export function huToStored(volume: CtVolume, hu: number): number {
  return (hu - volume.rescaleIntercept) / volume.rescaleSlope;
}

export function voxelCount(grid: ScalarGrid): number {
  return grid.dims[0] * grid.dims[1] * grid.dims[2];
}

export function voxelVolumeMm3(grid: ScalarGrid): number {
  return grid.spacing[0] * grid.spacing[1] * grid.spacing[2];
}

/**
 * Surrounds the grid with one layer of `value`.
 *
 * A scan ends where the field of view ends, so bone usually runs straight into the volume
 * border. Padding with "air" lets surface extraction cap those ends and return a closed mesh.
 */
export function padGrid(grid: ScalarGrid, value: number): ScalarGrid {
  const [nx, ny, nz] = grid.dims;
  const px = nx + 2;
  const py = ny + 2;
  const pz = nz + 2;
  const data = new Int16Array(px * py * pz).fill(value);
  for (let k = 0; k < nz; k++) {
    for (let j = 0; j < ny; j++) {
      const from = (k * ny + j) * nx;
      data.set(grid.data.subarray(from, from + nx), ((k + 1) * py + j + 1) * px + 1);
    }
  }
  return {
    data,
    dims: [px, py, pz],
    spacing: grid.spacing,
    origin: [
      grid.origin[0] - grid.spacing[0],
      grid.origin[1] - grid.spacing[1],
      grid.origin[2] - grid.spacing[2],
    ],
  };
}

/** Extent of the grid in millimetres, from the outer face of the first voxel to the last. */
export function gridBounds(grid: ScalarGrid): { min: Vec3; max: Vec3 } {
  const min = [0, 0, 0] as [number, number, number];
  const max = [0, 0, 0] as [number, number, number];
  for (let a = 0; a < 3; a++) {
    min[a] = grid.origin[a] - grid.spacing[a] / 2;
    max[a] = grid.origin[a] + (grid.dims[a] - 0.5) * grid.spacing[a];
  }
  return { min, max };
}
