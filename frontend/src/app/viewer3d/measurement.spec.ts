import { distanceMm, formatDistance } from './measurement';

describe('measurement', () => {
  it('measures the straight line between two points', () => {
    expect(distanceMm([0, 0, 0], [3, 4, 0])).toBe(5);
    expect(distanceMm([1, 2, 3], [1, 2, 3])).toBe(0);
    expect(distanceMm([-1, -1, -1], [1, 1, 1])).toBeCloseTo(Math.sqrt(12), 10);
  });

  it('formats millimetres with one decimal', () => {
    expect(formatDistance(23.449)).toBe('23.4 mm');
    expect(formatDistance(23.46)).toBe('23.5 mm');
    expect(formatDistance(7)).toBe('7.0 mm');
  });
});
