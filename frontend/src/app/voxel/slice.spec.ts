import { renderSlice, sliceLayout, slicePositionMm } from './slice';
import { CtVolume } from './volume';

/** 2 x 3 x 4 volume whose stored value encodes its own position: 100 * k + 10 * j + i. */
function volume(): CtVolume {
  const dims = [2, 3, 4] as const;
  const data = new Int16Array(24);
  for (let k = 0; k < 4; k++)
    for (let j = 0; j < 3; j++)
      for (let i = 0; i < 2; i++) data[(k * 3 + j) * 2 + i] = 100 * k + 10 * j + i;
  return {
    data,
    dims,
    spacing: [1, 2, 3],
    origin: [-5, 0, 10],
    rescaleSlope: 1,
    rescaleIntercept: 0,
  };
}

const fullRange = { center: 127.5, width: 255 }; // maps stored 0..255 straight to grey 0..255

function greys(v: CtVolume, axis: 'axial' | 'coronal' | 'sagittal', index: number): number[] {
  const { width, height } = sliceLayout(v, axis);
  const out = new Uint8ClampedArray(width * height * 4);
  renderSlice(v, axis, index, fullRange, null, out);
  return Array.from({ length: width * height }, (_, p) => out[p * 4]);
}

describe('sliceLayout', () => {
  it('reports image size, slice count and physical size per orientation', () => {
    const v = volume();
    expect(sliceLayout(v, 'axial')).toMatchObject({
      width: 2,
      height: 3,
      count: 4,
      widthMm: 2,
      heightMm: 6,
    });
    expect(sliceLayout(v, 'coronal')).toMatchObject({
      width: 2,
      height: 4,
      count: 3,
      widthMm: 2,
      heightMm: 12,
    });
    expect(sliceLayout(v, 'sagittal')).toMatchObject({
      width: 3,
      height: 4,
      count: 2,
      widthMm: 6,
      heightMm: 12,
    });
  });

  it('converts a slice index to millimetres along the stack axis', () => {
    const v = volume();
    expect(slicePositionMm(v, 'axial', 2)).toBe(16);
    expect(slicePositionMm(v, 'coronal', 1)).toBe(2);
    expect(slicePositionMm(v, 'sagittal', 1)).toBe(-4);
  });
});

describe('renderSlice', () => {
  it('reads axial slices row by row along y', () => {
    expect(greys(volume(), 'axial', 1)).toEqual([100, 101, 110, 111, 120, 121]);
  });

  it('shows distal at the top of coronal and sagittal slices', () => {
    expect(greys(volume(), 'coronal', 2).slice(0, 4)).toEqual([255, 255, 220, 221]); // k = 3 clamps, then k = 2
    expect(greys(volume(), 'sagittal', 1).slice(-3)).toEqual([1, 11, 21]); // bottom row is k = 0
  });

  it('applies the grey window in Hounsfield units', () => {
    const v: CtVolume = { ...volume(), rescaleIntercept: -1024 };
    const { width, height } = sliceLayout(v, 'axial');
    const out = new Uint8ClampedArray(width * height * 4);
    // stored 0..21 on slice 0 is -1024..-1003 HU: window exactly that range
    renderSlice(v, 'axial', 0, { center: -1013.5, width: 21 }, null, out);
    expect(out[0]).toBe(0);
    expect(out[(width * height - 1) * 4]).toBe(255);
    expect(out[3]).toBe(255);
  });

  it('tints voxels at or above the overlay threshold', () => {
    const v = volume();
    const { width, height } = sliceLayout(v, 'axial');
    const out = new Uint8ClampedArray(width * height * 4);
    renderSlice(v, 'axial', 1, fullRange, 111, out);
    const tinted = Array.from({ length: width * height }, (_, p) => out[p * 4] !== out[p * 4 + 2]);
    expect(tinted).toEqual([false, false, false, true, true, true]);
  });

  it('clamps the slice index and rejects a buffer of the wrong size', () => {
    const v = volume();
    expect(greys(v, 'axial', 99)).toEqual(greys(v, 'axial', 3));
    expect(() => renderSlice(v, 'axial', 0, fullRange, null, new Uint8ClampedArray(4))).toThrow(
      RangeError,
    );
  });
});
