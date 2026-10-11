import { SurfaceJob, SurfaceRequest, SurfaceResult } from './surface-protocol';
import { ScalarGrid } from './volume';

/** Where the extraction runs. Lets tests swap the worker for a synchronous stand-in. */
export interface SurfaceBackend {
  post(request: SurfaceRequest): void;
  onResult: (result: SurfaceResult) => void;
  dispose(): void;
}

export function createWorkerBackend(): SurfaceBackend {
  const worker = new Worker(new URL('./surface.worker', import.meta.url), { type: 'module' });
  const backend: SurfaceBackend = {
    post: (request) => worker.postMessage(request),
    onResult: () => {},
    dispose: () => worker.terminate(),
  };
  worker.onmessage = ({ data }: MessageEvent<SurfaceResult>) => backend.onResult(data);
  return backend;
}

/** Same work on the calling thread, delivered asynchronously like a worker would. */
export function createInlineBackend(): SurfaceBackend {
  const job = new SurfaceJob();
  let disposed = false;
  const backend: SurfaceBackend = {
    post: (request) => {
      if (request.type === 'load') {
        job.load(request.grid);
        return;
      }
      queueMicrotask(() => {
        if (!disposed) backend.onResult(job.extract(request.id, request.iso));
      });
    },
    onResult: () => {},
    dispose: () => {
      disposed = true;
    },
  };
  return backend;
}

/**
 * Turns a stream of threshold changes into surfaces without building up a backlog.
 *
 * The worker handles one request at a time. While it is busy only the most recent threshold
 * is remembered, so a slider drag that fires fifty events costs a handful of extractions and
 * the surface shown always belongs to the newest value that has finished.
 */
export class SurfaceExtractor {
  private nextId = 1;
  private busy = false;
  private queuedIso: number | null = null;
  private loaded = false;

  constructor(
    private readonly backend: SurfaceBackend,
    private readonly onSurface: (result: SurfaceResult) => void,
  ) {
    backend.onResult = (result) => this.handle(result);
  }

  /** Sends the volume once; the worker keeps its own copy. */
  load(grid: ScalarGrid): void {
    this.backend.post({ type: 'load', grid });
    this.loaded = true;
  }

  /** Asks for the surface at `iso` (in stored values). */
  request(iso: number): void {
    if (!this.loaded) throw new Error('Load a volume before requesting a surface');
    if (this.busy) {
      this.queuedIso = iso;
      return;
    }
    this.busy = true;
    this.backend.post({ type: 'extract', id: this.nextId++, iso });
  }

  dispose(): void {
    this.backend.onResult = () => {};
    this.backend.dispose();
  }

  private handle(result: SurfaceResult): void {
    this.busy = false;
    const queued = this.queuedIso;
    this.queuedIso = null;
    this.onSurface(result);
    if (queued !== null && queued !== result.iso) this.request(queued);
  }
}
