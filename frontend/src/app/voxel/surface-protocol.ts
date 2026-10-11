import { enclosedVolume, marchingCubes, SurfaceMesh } from './marching-cubes';
import { padGrid, ScalarGrid, voxelVolumeMm3 } from './volume';

/** Messages understood by the surface worker. */
export type SurfaceRequest =
  { type: 'load'; grid: ScalarGrid } | { type: 'extract'; id: number; iso: number };

export interface SurfaceResult {
  type: 'surface';
  id: number;
  iso: number;
  mesh: SurfaceMesh;
  triangleCount: number;
  /** Volume enclosed by the surface, in mm³. */
  enclosedMm3: number;
  /** Voxels at or above the threshold times the voxel volume, in mm³. */
  voxelMm3: number;
  /** Time spent extracting, in milliseconds. */
  elapsedMs: number;
}

const AIR = -32768;

/**
 * The work done for each request, kept free of worker globals so that it can run on the
 * main thread as well (in unit tests, or in a browser without module workers).
 */
export class SurfaceJob {
  private padded: ScalarGrid | null = null;
  private source: ScalarGrid | null = null;

  load(grid: ScalarGrid): void {
    this.source = grid;
    this.padded = padGrid(grid, AIR);
  }

  extract(id: number, iso: number): SurfaceResult {
    if (!this.padded || !this.source) throw new Error('No volume loaded');
    const start = performance.now();
    const mesh = marchingCubes(this.padded, iso);
    const elapsedMs = performance.now() - start;

    let above = 0;
    const data = this.source.data;
    for (let n = 0; n < data.length; n++) if (data[n] >= iso) above++;

    return {
      type: 'surface',
      id,
      iso,
      mesh,
      triangleCount: mesh.indices.length / 3,
      enclosedMm3: enclosedVolume(mesh),
      voxelMm3: above * voxelVolumeMm3(this.source),
      elapsedMs,
    };
  }
}
