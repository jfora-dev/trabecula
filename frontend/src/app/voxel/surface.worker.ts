/// <reference lib="webworker" />
import { SurfaceJob, SurfaceRequest } from './surface-protocol';

// Runs marching cubes off the main thread so dragging the threshold never stalls the page.
const job = new SurfaceJob();

addEventListener('message', ({ data }: MessageEvent<SurfaceRequest>) => {
  if (data.type === 'load') {
    job.load(data.grid);
    return;
  }
  const result = job.extract(data.id, data.iso);
  // Hand the buffers over instead of copying them.
  postMessage(result, [
    result.mesh.positions.buffer,
    result.mesh.normals.buffer,
    result.mesh.indices.buffer,
  ]);
});
