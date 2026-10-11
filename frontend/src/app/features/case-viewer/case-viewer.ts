import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  computed,
  effect,
  inject,
  input,
  signal,
  untracked,
  viewChild,
} from '@angular/core';
import { BufferGeometry } from 'three';
import { CaseDetail, CaseModel, ModelKind, PlanStage } from '../../core/api/case.models';
import { CasesApi, describeError } from '../../core/api/cases-api';
import { DemoState } from '../../core/demo-state';
import { Measurement } from '../../viewer3d/measurement';
import {
  LayerDisplay,
  LayerMaterial,
  LayerSpec,
  SlicePlane,
  ViewPreset,
} from '../../viewer3d/scene-engine';
import { geometryFromSurface, parseStl } from '../../viewer3d/stl';
import { Viewport } from '../../viewer3d/viewport';
import { sliceLayout, slicePositionMm } from '../../voxel/slice';
import {
  SurfaceExtractor,
  createInlineBackend,
  createWorkerBackend,
} from '../../voxel/surface-extractor';
import { SurfaceResult } from '../../voxel/surface-protocol';
import { CtVolume, gridBounds, huToStored, storedToHu } from '../../voxel/volume';
import { CaseFilePanel, TransitionIntent } from './case-file-panel';
import { CtPanel, SliceSelection, SurfaceStats } from './ct-panel';
import { PlanPanel } from './plan-panel';

type Mode = 'plan' | 'ct';

const MATERIAL: Record<ModelKind, LayerMaterial> = {
  BONE: 'bone',
  PLATE: 'titanium',
  SCREW: 'titanium',
  GUIDE: 'polymer',
  OSTEOTOMY_PLANE: 'marker',
};
const CT_LAYER = 'ct-surface';
const CT_COLOR = '#cfd8e3';

/**
 * The review page for one case. It holds the state; the panels and the viewport render it.
 *
 * Two workspaces share one 3D view: "plan" shows the designer's models before and after the
 * correction, "ct" shows the bone surface extracted live from the scan.
 */
@Component({
  selector: 'app-case-viewer',
  imports: [Viewport, CaseFilePanel, PlanPanel, CtPanel],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './case-viewer.html',
  styleUrl: './case-viewer.scss',
})
export class CaseViewer {
  /** Route parameter, bound by the router. */
  readonly id = input.required<string>();

  private readonly api = inject(CasesApi);
  private readonly demo = inject(DemoState);
  private readonly viewport = viewChild(Viewport);

  protected readonly detail = signal<CaseDetail | null>(null);
  protected readonly loadError = signal<string | null>(null);
  protected readonly transitionBusy = signal(false);
  protected readonly transitionError = signal<string | null>(null);

  protected readonly mode = signal<Mode>('plan');
  protected readonly stage = signal<PlanStage>('PREOP');
  protected readonly display = signal<Readonly<Record<string, LayerDisplay>>>({});
  protected readonly measuring = signal(false);
  protected readonly pendingPoint = signal(false);
  protected readonly measurements = signal<readonly Measurement[]>([]);

  protected readonly volume = signal<CtVolume | null>(null);
  protected readonly volumeError = signal<string | null>(null);
  protected readonly thresholdHu = signal(300);
  protected readonly surfaceStats = signal<SurfaceStats | null>(null);
  protected readonly compare = signal(false);
  private readonly slice = signal<SliceSelection | null>(null);

  private readonly geometries = signal<ReadonlyMap<string, BufferGeometry>>(new Map());
  private readonly modelError = signal<string | null>(null);
  private readonly ctGeometry = signal<BufferGeometry | null>(null);
  private extractor: SurfaceExtractor | null = null;
  private volumeRequested = false;

  protected readonly hasPlan = computed(
    () => this.detail()?.models.some((m) => m.stage === 'PLANNED') ?? false,
  );
  protected readonly stageModels = computed(() =>
    (this.detail()?.models ?? []).filter((m) => m.stage === this.stage()),
  );
  protected readonly modelsReady = computed(() => {
    const models = this.detail()?.models ?? [];
    return models.length > 0 && models.every((m) => this.geometries().has(m.id));
  });

  /** Everything the 3D view should draw right now. */
  protected readonly layers = computed<LayerSpec[]>(() => {
    const detail = this.detail();
    if (!detail || !this.modelsReady()) return [];
    const geometries = this.geometries();
    const ct = this.mode() === 'ct';
    const display = this.display();
    const specs: LayerSpec[] = [];

    // Comparing turns the extracted surface into a shell around the designer's bone models,
    // which shows what a threshold alone cannot do: tell the radius from the carpal bones.
    const compare = ct && this.compare();
    for (const model of detail.models) {
      let shown: LayerDisplay;
      if (ct) {
        shown = compare && model.kind === 'BONE' && model.stage === 'PREOP' ? 'solid' : 'hidden';
      } else {
        shown = model.stage === this.stage() ? (display[model.id] ?? 'solid') : 'hidden';
      }
      specs.push({
        id: model.id,
        geometry: geometries.get(model.id)!,
        color: model.color,
        material: MATERIAL[model.kind],
        display: shown,
      });
    }
    const surface = this.ctGeometry();
    if (surface) {
      specs.push({
        id: CT_LAYER,
        geometry: surface,
        color: CT_COLOR,
        material: 'segmentation',
        display: !ct ? 'hidden' : compare ? 'ghost' : 'solid',
        ownsGeometry: true,
      });
    }
    return specs;
  });

  protected readonly slicePlane = computed<SlicePlane | null>(() => {
    const volume = this.volume();
    const slice = this.slice();
    if (this.mode() !== 'ct' || !volume || !slice) return null;
    const { min, max } = gridBounds(volume);
    return {
      axis: sliceLayout(volume, slice.axis).normalAxis,
      positionMm: slicePositionMm(volume, slice.axis, slice.index),
      min,
      max,
    };
  });

  protected readonly statusLine = computed(() => {
    const detail = this.detail();
    if (!detail) return '';
    if (this.modelError()) return `The 3D models could not be loaded. ${this.modelError()}`;
    if (!this.modelsReady())
      return `Loading 3D models, ${this.geometries().size} of ${detail.models.length}`;
    if (this.mode() === 'ct') {
      if (this.volumeError()) return '';
      if (!this.volume()) return 'Loading the CT scan';
      if (!this.surfaceStats()) return 'Building the bone surface from the scan';
      return 'Drag to rotate, scroll to zoom, right-drag to move';
    }
    if (this.measuring()) {
      return this.pendingPoint()
        ? 'Click the second point'
        : 'Click the first point on a solid model';
    }
    return 'Drag to rotate, scroll to zoom, right-drag to move';
  });

  protected readonly views: { preset: ViewPreset; label: string }[] = [
    { preset: 'overview', label: 'Overview' },
    { preset: 'volar', label: 'Volar' },
    { preset: 'dorsal', label: 'Dorsal' },
    { preset: 'radial', label: 'Radial' },
    { preset: 'ulnar', label: 'Ulnar' },
  ];

  constructor() {
    // Load the case when the route changes, and again after a demo reset.
    effect(() => {
      const id = this.id();
      this.demo.generation();
      untracked(() => this.loadCase(id));
    });

    // Moving the threshold asks for a new surface; the extractor drops requests it cannot keep up with.
    effect(() => {
      const volume = this.volume();
      const threshold = this.thresholdHu();
      if (volume) this.extractor?.request(huToStored(volume, threshold));
    });

    inject(DestroyRef).onDestroy(() => {
      this.extractor?.dispose();
      for (const geometry of this.geometries().values()) geometry.dispose();
    });
  }

  protected setMode(mode: Mode): void {
    this.mode.set(mode);
    if (mode === 'ct') {
      this.measuring.set(false);
      this.loadVolume();
    }
  }

  protected setDisplay(change: { modelId: string; display: LayerDisplay }): void {
    this.display.update((current) => ({ ...current, [change.modelId]: change.display }));
  }

  protected setView(preset: ViewPreset): void {
    this.viewport()?.setView(preset);
  }

  protected removeMeasurement(id: number): void {
    this.viewport()?.removeMeasurement(id);
  }

  protected clearMeasurements(): void {
    this.viewport()?.clearMeasurements();
  }

  protected onSlice(selection: SliceSelection): void {
    this.slice.set(selection);
  }

  protected onTransition(intent: TransitionIntent): void {
    const detail = this.detail();
    if (!detail || this.transitionBusy()) return;
    this.transitionBusy.set(true);
    this.transitionError.set(null);
    this.api
      .transition(detail.id, {
        action: intent.action,
        expectedVersion: detail.version,
        comment: intent.comment,
      })
      .subscribe({
        next: (updated) => {
          this.transitionBusy.set(false);
          this.detail.set(updated);
        },
        error: (error: unknown) => {
          this.transitionBusy.set(false);
          this.transitionError.set(describeError(error));
        },
      });
  }

  private loadCase(id: string): void {
    this.loadError.set(null);
    this.transitionError.set(null);
    this.api.get(id).subscribe({
      next: (detail) => {
        const first = this.detail()?.id !== detail.id;
        this.detail.set(detail);
        if (!first) return;
        this.stage.set(detail.models.some((m) => m.stage === 'PLANNED') ? 'PLANNED' : 'PREOP');
        this.display.set({});
        this.thresholdHu.set(detail.volume?.suggestedBoneThresholdHu ?? 300);
        for (const model of detail.models) this.loadModel(model);
      },
      error: (error: unknown) => this.loadError.set(describeError(error)),
    });
  }

  private loadModel(model: CaseModel): void {
    this.api.modelFile(model.fileUrl).subscribe({
      next: (buffer) => {
        const geometry = parseStl(buffer);
        this.geometries.update((map) => new Map(map).set(model.id, geometry));
      },
      error: (error: unknown) => this.modelError.set(describeError(error)),
    });
  }

  private loadVolume(): void {
    const info = this.detail()?.volume;
    if (!info || this.volumeRequested) return;
    this.volumeRequested = true;
    this.volumeError.set(null);
    this.api.volume(info).subscribe({
      next: (volume) => {
        this.extractor = new SurfaceExtractor(createBackend(), (result) =>
          this.onSurface(volume, result),
        );
        this.extractor.load(volume);
        this.volume.set(volume); // triggers the first extraction through the threshold effect
      },
      error: (error: unknown) => {
        this.volumeRequested = false;
        this.volumeError.set(describeError(error));
      },
    });
  }

  private onSurface(volume: CtVolume, result: SurfaceResult): void {
    this.ctGeometry.set(geometryFromSurface(result.mesh));
    this.surfaceStats.set({
      thresholdHu: Math.round(storedToHu(volume, result.iso)),
      triangleCount: result.triangleCount,
      elapsedMs: result.elapsedMs,
      voxelMm3: result.voxelMm3,
    });
  }
}

function createBackend() {
  try {
    return createWorkerBackend();
  } catch {
    // No module workers (very old browser, or a locked-down page): slower, but it still works.
    return createInlineBackend();
  }
}
