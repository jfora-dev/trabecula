import { BufferAttribute, BufferGeometry } from 'three';
import { STLLoader } from 'three/addons/loaders/STLLoader.js';
import { toCreasedNormals } from 'three/addons/utils/BufferGeometryUtils.js';
import { SurfaceMesh } from '../voxel/marching-cubes';

const loader = new STLLoader();
const CREASE_ANGLE = (38 * Math.PI) / 180;

/**
 * Parses a binary or ASCII STL into a geometry ready for shading.
 *
 * STL stores one flat normal per triangle. Normals are recomputed here so that curved
 * surfaces shade smoothly while edges sharper than the crease angle (plate rims, drill
 * sleeves) stay crisp.
 */
export function parseStl(buffer: ArrayBuffer): BufferGeometry {
  const raw = loader.parse(buffer);
  raw.deleteAttribute('normal');
  const geometry = toCreasedNormals(raw, CREASE_ANGLE);
  raw.dispose();
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  return geometry;
}

/** Wraps the typed arrays produced by surface extraction without copying them. */
export function geometryFromSurface(mesh: SurfaceMesh): BufferGeometry {
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new BufferAttribute(mesh.positions, 3));
  geometry.setAttribute('normal', new BufferAttribute(mesh.normals, 3));
  geometry.setIndex(new BufferAttribute(mesh.indices, 1));
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  return geometry;
}

export function triangleCount(geometry: BufferGeometry): number {
  return (geometry.index ? geometry.index.count : geometry.getAttribute('position').count) / 3;
}
