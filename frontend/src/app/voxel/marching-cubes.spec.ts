import { enclosedVolume, marchingCubes, SurfaceMesh } from './marching-cubes';
import { padGrid, ScalarGrid } from './volume';

/** A ball of the given radius, stored as "distance inside the surface" in 1/100 mm. */
function ball(size: number, radius: number, spacing = 1): ScalarGrid {
  const data = new Int16Array(size ** 3);
  const centre = ((size - 1) * spacing) / 2;
  for (let k = 0; k < size; k++) {
    for (let j = 0; j < size; j++) {
      for (let i = 0; i < size; i++) {
        const d = Math.hypot(i * spacing - centre, j * spacing - centre, k * spacing - centre);
        data[(k * size + j) * size + i] = Math.round((radius - d) * 100);
      }
    }
  }
  return {
    data,
    dims: [size, size, size],
    spacing: [spacing, spacing, spacing],
    origin: [0, 0, 0],
  };
}

/** In a closed surface every edge is used by exactly two triangles, once in each direction. */
function openEdgeCount(mesh: SurfaceMesh): number {
  const balance = new Map<string, number>();
  for (let n = 0; n < mesh.indices.length; n += 3) {
    for (let e = 0; e < 3; e++) {
      const a = mesh.indices[n + e];
      const b = mesh.indices[n + ((e + 1) % 3)];
      const key = a < b ? `${a}-${b}` : `${b}-${a}`;
      balance.set(key, (balance.get(key) ?? 0) + (a < b ? 1 : -1));
    }
  }
  return [...balance.values()].filter((v) => v !== 0).length;
}

describe('marchingCubes', () => {
  it('returns an empty mesh when nothing crosses the threshold', () => {
    const mesh = marchingCubes(ball(12, 4), 10_000);
    expect(mesh.indices.length).toBe(0);
    expect(mesh.positions.length).toBe(0);
  });

  it('extracts a closed, outward-facing sphere with the right volume', () => {
    const radius = 10;
    const mesh = marchingCubes(ball(32, radius), 0);

    expect(mesh.indices.length % 3).toBe(0);
    expect(openEdgeCount(mesh)).toBe(0);

    const expected = (4 / 3) * Math.PI * radius ** 3;
    const volume = enclosedVolume(mesh);
    expect(volume).toBeGreaterThan(0); // negative would mean inverted triangles
    expect(Math.abs(volume - expected) / expected).toBeLessThan(0.01);
  });

  it('places vertices on the surface and points normals away from the centre', () => {
    const radius = 10;
    const centre = 15.5;
    const { positions, normals } = marchingCubes(ball(32, radius), 0);
    for (let o = 0; o < positions.length; o += 3) {
      const x = positions[o] - centre;
      const y = positions[o + 1] - centre;
      const z = positions[o + 2] - centre;
      const r = Math.hypot(x, y, z);
      expect(Math.abs(r - radius)).toBeLessThan(0.05);
      expect(Math.hypot(normals[o], normals[o + 1], normals[o + 2])).toBeCloseTo(1, 4);
      expect((x * normals[o] + y * normals[o + 1] + z * normals[o + 2]) / r).toBeGreaterThan(0.97);
    }
  });

  it('shares vertices between neighbouring triangles', () => {
    const mesh = marchingCubes(ball(32, 10), 0);
    const vertices = mesh.positions.length / 3;
    const triangles = mesh.indices.length / 3;
    // Euler's formula for a closed surface without holes: V - E + F = 2, with E = 3F / 2.
    expect(vertices - triangles / 2).toBe(2);
  });

  it('respects spacing and origin', () => {
    const grid: ScalarGrid = { ...ball(32, 5, 0.5), origin: [100, 200, 300] };
    const { positions } = marchingCubes(grid, 0);
    const centre = [100 + 7.75, 200 + 7.75, 300 + 7.75];
    for (let o = 0; o < positions.length; o += 3) {
      const r = Math.hypot(
        positions[o] - centre[0],
        positions[o + 1] - centre[1],
        positions[o + 2] - centre[2],
      );
      expect(Math.abs(r - 5)).toBeLessThan(0.05);
    }
  });

  it('moves the surface continuously with a fractional threshold', () => {
    const grid = ball(32, 10);
    const outer = enclosedVolume(marchingCubes(grid, 0));
    const inner = enclosedVolume(marchingCubes(grid, 50.5)); // 0.505 mm further in
    const expected = (4 / 3) * Math.PI * 9.495 ** 3;
    expect(inner).toBeLessThan(outer);
    expect(Math.abs(inner - expected) / expected).toBeLessThan(0.01);
  });

  it('leaves the mesh open at the grid border and closes it after padding', () => {
    // A ball larger than the grid: it is cut off by all six faces.
    const cut = ball(16, 9);
    expect(openEdgeCount(marchingCubes(cut, 0))).toBeGreaterThan(0);

    const padded = padGrid(cut, -32768);
    const mesh = marchingCubes(padded, 0);
    expect(openEdgeCount(mesh)).toBe(0);
    expect(enclosedVolume(mesh)).toBeGreaterThan(0);
  });
});

describe('padGrid', () => {
  it('adds one layer on every side and shifts the origin to match', () => {
    const grid: ScalarGrid = {
      data: Int16Array.from([1, 2, 3, 4, 5, 6, 7, 8]),
      dims: [2, 2, 2],
      spacing: [0.5, 1, 2],
      origin: [10, 20, 30],
    };
    const padded = padGrid(grid, -9);
    expect(padded.dims).toEqual([4, 4, 4]);
    expect(padded.origin).toEqual([9.5, 19, 28]);
    expect(padded.data.length).toBe(64);
    const at = (i: number, j: number, k: number) => padded.data[(k * 4 + j) * 4 + i];
    expect(at(0, 0, 0)).toBe(-9);
    expect(at(1, 1, 1)).toBe(1);
    expect(at(2, 1, 1)).toBe(2);
    expect(at(1, 2, 1)).toBe(3);
    expect(at(2, 2, 2)).toBe(8);
    expect(at(3, 3, 3)).toBe(-9);
  });
});
