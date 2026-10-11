import { TRI_TABLE } from './mc-tables';
import { ScalarGrid } from './volume';

/** Indexed triangle mesh in millimetres. Vertices are shared, normals are per vertex. */
export interface SurfaceMesh {
  positions: Float32Array;
  normals: Float32Array;
  indices: Uint32Array;
}

// Cube corners in the numbering the lookup table expects.
const CORNER_X = [0, 1, 1, 0, 0, 1, 1, 0];
const CORNER_Y = [0, 0, 1, 1, 0, 0, 1, 1];
const CORNER_Z = [0, 0, 0, 0, 1, 1, 1, 1];
// The two corners joined by each of the 12 cube edges.
const EDGE_A = [0, 1, 2, 3, 4, 5, 6, 7, 0, 1, 2, 3];
const EDGE_B = [1, 2, 3, 0, 5, 6, 7, 4, 4, 5, 6, 7];

/**
 * Marching cubes: extracts the surface where the grid crosses `iso`.
 *
 * Values at or above `iso` count as inside, and triangles wind counter-clockwise when seen
 * from outside. Three things differ from the textbook version:
 *
 *  - Vertices are shared. A vertex sits on a grid edge and up to four cubes touch that edge,
 *    so each one is created once and looked up afterwards. Only two slices of the lookup
 *    are kept in memory, which is all a z-sweep ever needs.
 *  - Normals come from the gradient of the data rather than from the triangles, which is
 *    smoother and already known at the grid points.
 *  - `iso` is a float, so the surface moves continuously between the integer samples.
 *
 * The surface is left open where the object reaches the grid border; use `padGrid` first to
 * get a closed mesh.
 */
export function marchingCubes(grid: ScalarGrid, iso: number): SurfaceMesh {
  const { data, spacing, origin } = grid;
  const [nx, ny, nz] = grid.dims;
  const sliceSize = nx * ny;

  let positions = new Float32Array(3 * 4096);
  let normals = new Float32Array(3 * 4096);
  let indices = new Uint32Array(3 * 8192);
  let vertexCount = 0;
  let indexCount = 0;

  // Vertex ids on the edges leaving each grid point of a slice, or -1 when not created yet.
  let xEdgesLow = new Int32Array(sliceSize).fill(-1);
  let xEdgesHigh = new Int32Array(sliceSize).fill(-1);
  let yEdgesLow = new Int32Array(sliceSize).fill(-1);
  let yEdgesHigh = new Int32Array(sliceSize).fill(-1);
  const zEdges = new Int32Array(sliceSize).fill(-1);

  const value = new Float32Array(8);
  const edgeVertex = new Int32Array(12);

  const sample = (i: number, j: number, k: number): number => {
    const ci = i < 0 ? 0 : i >= nx ? nx - 1 : i;
    const cj = j < 0 ? 0 : j >= ny ? ny - 1 : j;
    const ck = k < 0 ? 0 : k >= nz ? nz - 1 : k;
    return data[(ck * ny + cj) * nx + ci];
  };

  const createVertex = (
    ai: number,
    aj: number,
    ak: number,
    av: number,
    bi: number,
    bj: number,
    bk: number,
    bv: number,
  ): number => {
    if (3 * vertexCount + 3 > positions.length) {
      positions = grow(positions);
      normals = grow(normals);
    }
    const t = (iso - av) / (bv - av);
    const o = 3 * vertexCount;
    positions[o] = origin[0] + (ai + t * (bi - ai)) * spacing[0];
    positions[o + 1] = origin[1] + (aj + t * (bj - aj)) * spacing[1];
    positions[o + 2] = origin[2] + (ak + t * (bk - ak)) * spacing[2];

    // Central-difference gradient at both ends of the edge, blended like the position.
    // It points towards higher values (into the object), so the normal is its negative.
    const gax = (sample(ai + 1, aj, ak) - sample(ai - 1, aj, ak)) / spacing[0];
    const gay = (sample(ai, aj + 1, ak) - sample(ai, aj - 1, ak)) / spacing[1];
    const gaz = (sample(ai, aj, ak + 1) - sample(ai, aj, ak - 1)) / spacing[2];
    const gbx = (sample(bi + 1, bj, bk) - sample(bi - 1, bj, bk)) / spacing[0];
    const gby = (sample(bi, bj + 1, bk) - sample(bi, bj - 1, bk)) / spacing[1];
    const gbz = (sample(bi, bj, bk + 1) - sample(bi, bj, bk - 1)) / spacing[2];
    const gx = gax + t * (gbx - gax);
    const gy = gay + t * (gby - gay);
    const gz = gaz + t * (gbz - gaz);
    const length = Math.hypot(gx, gy, gz) || 1;
    normals[o] = -gx / length;
    normals[o + 1] = -gy / length;
    normals[o + 2] = -gz / length;
    return vertexCount++;
  };

  for (let k = 0; k < nz - 1; k++) {
    for (let j = 0; j < ny - 1; j++) {
      const row = (k * ny + j) * nx;
      for (let i = 0; i < nx - 1; i++) {
        const q = row + i;
        value[0] = data[q];
        value[1] = data[q + 1];
        value[2] = data[q + 1 + nx];
        value[3] = data[q + nx];
        value[4] = data[q + sliceSize];
        value[5] = data[q + 1 + sliceSize];
        value[6] = data[q + 1 + nx + sliceSize];
        value[7] = data[q + nx + sliceSize];

        let cube = 0;
        if (value[0] < iso) cube |= 1;
        if (value[1] < iso) cube |= 2;
        if (value[2] < iso) cube |= 4;
        if (value[3] < iso) cube |= 8;
        if (value[4] < iso) cube |= 16;
        if (value[5] < iso) cube |= 32;
        if (value[6] < iso) cube |= 64;
        if (value[7] < iso) cube |= 128;
        if (cube === 0 || cube === 255) continue;

        const c = j * nx + i; // this cube's corner 0 within a slice
        edgeVertex.fill(-1);
        const table = cube * 16;
        for (let n = 0; n < 16 && TRI_TABLE[table + n] !== -1; n++) {
          const edge = TRI_TABLE[table + n];
          let vertex = edgeVertex[edge];
          if (vertex === -1) {
            // Find the slot that owns this edge: the grid point it starts from, and its axis.
            let cache: Int32Array;
            let slot: number;
            switch (edge) {
              case 0:
                cache = xEdgesLow;
                slot = c;
                break;
              case 1:
                cache = yEdgesLow;
                slot = c + 1;
                break;
              case 2:
                cache = xEdgesLow;
                slot = c + nx;
                break;
              case 3:
                cache = yEdgesLow;
                slot = c;
                break;
              case 4:
                cache = xEdgesHigh;
                slot = c;
                break;
              case 5:
                cache = yEdgesHigh;
                slot = c + 1;
                break;
              case 6:
                cache = xEdgesHigh;
                slot = c + nx;
                break;
              case 7:
                cache = yEdgesHigh;
                slot = c;
                break;
              case 8:
                cache = zEdges;
                slot = c;
                break;
              case 9:
                cache = zEdges;
                slot = c + 1;
                break;
              case 10:
                cache = zEdges;
                slot = c + 1 + nx;
                break;
              default:
                cache = zEdges;
                slot = c + nx;
                break;
            }
            vertex = cache[slot];
            if (vertex === -1) {
              const a = EDGE_A[edge];
              const b = EDGE_B[edge];
              vertex = createVertex(
                i + CORNER_X[a],
                j + CORNER_Y[a],
                k + CORNER_Z[a],
                value[a],
                i + CORNER_X[b],
                j + CORNER_Y[b],
                k + CORNER_Z[b],
                value[b],
              );
              cache[slot] = vertex;
            }
            edgeVertex[edge] = vertex;
          }
          if (indexCount === indices.length) indices = grow(indices);
          indices[indexCount++] = vertex;
        }
      }
    }
    // Step up one slice: the upper edges become the lower ones.
    [xEdgesLow, xEdgesHigh] = [xEdgesHigh, xEdgesLow];
    [yEdgesLow, yEdgesHigh] = [yEdgesHigh, yEdgesLow];
    xEdgesHigh.fill(-1);
    yEdgesHigh.fill(-1);
    zEdges.fill(-1);
  }

  return {
    positions: positions.slice(0, 3 * vertexCount),
    normals: normals.slice(0, 3 * vertexCount),
    indices: indices.slice(0, indexCount),
  };
}

function grow<T extends Float32Array | Uint32Array>(array: T): T {
  const bigger = new (array.constructor as new (length: number) => T)(array.length * 2);
  bigger.set(array);
  return bigger;
}

/** Volume enclosed by a closed mesh, in cubic millimetres (divergence theorem). */
export function enclosedVolume(mesh: SurfaceMesh): number {
  const { positions: p, indices } = mesh;
  let six = 0;
  for (let n = 0; n < indices.length; n += 3) {
    const a = 3 * indices[n];
    const b = 3 * indices[n + 1];
    const c = 3 * indices[n + 2];
    six +=
      p[a] * (p[b + 1] * p[c + 2] - p[b + 2] * p[c + 1]) +
      p[a + 1] * (p[b + 2] * p[c] - p[b] * p[c + 2]) +
      p[a + 2] * (p[b] * p[c + 1] - p[b + 1] * p[c]);
  }
  return six / 6;
}
