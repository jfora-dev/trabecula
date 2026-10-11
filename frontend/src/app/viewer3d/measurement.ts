export type Point3 = readonly [number, number, number];

export interface Measurement {
  id: number;
  start: Point3;
  end: Point3;
  /** Straight-line distance between the two points, in millimetres. */
  distanceMm: number;
}

/** Straight-line distance. It ignores whatever surface lies between the two points. */
export function distanceMm(a: Point3, b: Point3): number {
  return Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]);
}

/** One decimal: finer than that would overstate what a 0.6 mm scan can resolve. */
export function formatDistance(mm: number): string {
  return `${mm.toFixed(1)} mm`;
}
