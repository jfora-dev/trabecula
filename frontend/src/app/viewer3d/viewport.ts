import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  ElementRef,
  afterNextRender,
  effect,
  inject,
  input,
  output,
  signal,
  viewChild,
} from '@angular/core';
import { Measurement } from './measurement';
import { LayerSpec, SceneEngine, SlicePlane, ViewPreset } from './scene-engine';

/**
 * Angular wrapper around the WebGL scene.
 *
 * The component owns no 3D logic: it creates the engine once the canvas exists and forwards
 * its inputs to it, so the engine never has to know about change detection.
 */
@Component({
  selector: 'app-viewport',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <canvas #canvas aria-label="3D view of the case models"></canvas>
    <svg #overlay class="annotations" aria-hidden="true"></svg>
    @if (unavailable()) {
      <p class="unavailable" role="alert">
        This browser could not start WebGL, so the 3D view is not available. Try a current version
        of Chrome, Firefox, Safari or Edge with hardware acceleration switched on.
      </p>
    }
  `,
  styleUrl: './viewport.scss',
  host: { '[attr.data-ready]': 'ready()', '[attr.data-layer-count]': 'layers().length' },
})
export class Viewport {
  readonly layers = input.required<LayerSpec[]>();
  readonly side = input.required<'LEFT' | 'RIGHT'>();
  readonly measuring = input(false);
  readonly slicePlane = input<SlicePlane | null>(null);

  readonly measurementsChange = output<readonly Measurement[]>();
  readonly pendingPointChange = output<boolean>();

  protected readonly ready = signal(false);
  protected readonly unavailable = signal(false);

  private readonly canvas = viewChild.required<ElementRef<HTMLCanvasElement>>('canvas');
  private readonly overlay = viewChild.required<ElementRef<SVGSVGElement>>('overlay');
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  private engine: SceneEngine | null = null;
  private framed = false;

  constructor() {
    afterNextRender(() => {
      try {
        this.engine = new SceneEngine(
          this.canvas().nativeElement,
          this.host.nativeElement,
          this.overlay().nativeElement,
        );
      } catch {
        this.unavailable.set(true);
        return;
      }
      this.engine.onMeasurements = (list) => this.measurementsChange.emit(list);
      this.engine.onPendingPoint = (pending) => this.pendingPointChange.emit(pending);
      this.ready.set(true);
    });

    effect(() => {
      if (!this.ready() || !this.engine) return;
      const engine = this.engine;
      const specs = this.layers();
      engine.setSide(this.side());
      const wanted = new Set(specs.map((s) => s.id));
      for (const id of engine.layerIds()) if (!wanted.has(id)) engine.removeLayer(id);
      for (const spec of specs) engine.setLayer(spec);
      // Frame the models once, when they first arrive. After that the camera belongs to the user.
      if (!this.framed && specs.length > 0) {
        this.framed = true;
        engine.setView('overview', false);
      }
    });

    effect(() => {
      if (this.ready()) this.engine?.setMeasuring(this.measuring());
    });

    effect(() => {
      if (this.ready()) this.engine?.setSlicePlane(this.slicePlane());
    });

    inject(DestroyRef).onDestroy(() => this.engine?.dispose());
  }

  setView(preset: ViewPreset): void {
    this.engine?.setView(preset);
  }

  clearMeasurements(): void {
    this.engine?.clearMeasurements();
  }

  removeMeasurement(id: number): void {
    this.engine?.removeMeasurement(id);
  }
}
