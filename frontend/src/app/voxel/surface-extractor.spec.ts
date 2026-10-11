import { SurfaceBackend, SurfaceExtractor, createInlineBackend } from './surface-extractor';
import { SurfaceRequest, SurfaceResult } from './surface-protocol';
import { ScalarGrid } from './volume';

const grid: ScalarGrid = {
  // one bright voxel in the middle of a 3 x 3 x 3 block
  data: Int16Array.from({ length: 27 }, (_, n) => (n === 13 ? 1000 : 0)),
  dims: [3, 3, 3],
  spacing: [1, 1, 1],
  origin: [0, 0, 0],
};

/** A backend the test completes by hand, to control the timing. */
class ManualBackend implements SurfaceBackend {
  readonly extracts: Extract<SurfaceRequest, { type: 'extract' }>[] = [];
  onResult: (result: SurfaceResult) => void = () => {};
  disposed = false;

  post(request: SurfaceRequest): void {
    if (request.type === 'extract') this.extracts.push(request);
  }

  finish(index: number): void {
    const { id, iso } = this.extracts[index];
    this.onResult({
      type: 'surface',
      id,
      iso,
      mesh: {
        positions: new Float32Array(),
        normals: new Float32Array(),
        indices: new Uint32Array(),
      },
      triangleCount: 0,
      enclosedMm3: 0,
      voxelMm3: 0,
      elapsedMs: 1,
    });
  }

  dispose(): void {
    this.disposed = true;
  }
}

describe('SurfaceExtractor', () => {
  it('refuses to extract before a volume is loaded', () => {
    const extractor = new SurfaceExtractor(new ManualBackend(), () => {});
    expect(() => extractor.request(100)).toThrow();
  });

  it('runs one extraction at a time and only keeps the newest pending threshold', () => {
    const backend = new ManualBackend();
    const delivered: number[] = [];
    const extractor = new SurfaceExtractor(backend, (r) => delivered.push(r.iso));
    extractor.load(grid);

    extractor.request(100);
    extractor.request(200);
    extractor.request(300);
    extractor.request(400);
    expect(backend.extracts.map((e) => e.iso)).toEqual([100]);

    backend.finish(0);
    expect(delivered).toEqual([100]);
    expect(backend.extracts.map((e) => e.iso)).toEqual([100, 400]);

    backend.finish(1);
    expect(delivered).toEqual([100, 400]);
    expect(backend.extracts.length).toBe(2);
  });

  it('does not repeat an extraction when the pending threshold equals the finished one', () => {
    const backend = new ManualBackend();
    const extractor = new SurfaceExtractor(backend, () => {});
    extractor.load(grid);
    extractor.request(100);
    extractor.request(100);
    backend.finish(0);
    expect(backend.extracts.length).toBe(1);
  });

  it('stops delivering after dispose', () => {
    const backend = new ManualBackend();
    const delivered: number[] = [];
    const extractor = new SurfaceExtractor(backend, (r) => delivered.push(r.iso));
    extractor.load(grid);
    extractor.request(100);
    extractor.dispose();
    backend.finish(0);
    expect(delivered).toEqual([]);
    expect(backend.disposed).toBe(true);
  });

  it('produces a closed surface and volume figures through the inline backend', async () => {
    const result = await new Promise<SurfaceResult>((resolve) => {
      const extractor = new SurfaceExtractor(createInlineBackend(), resolve);
      extractor.load(grid);
      extractor.request(500);
    });
    // A single voxel above the threshold becomes an octahedron: 8 triangles, 6 vertices.
    expect(result.triangleCount).toBe(8);
    expect(result.mesh.positions.length).toBe(18);
    expect(result.voxelMm3).toBe(1);
    expect(result.enclosedMm3).toBeCloseTo((4 / 3) * 0.5 ** 3, 5);
    expect(result.elapsedMs).toBeGreaterThanOrEqual(0);
  });
});
