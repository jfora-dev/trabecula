import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  computed,
  effect,
  input,
  output,
  signal,
  untracked,
  viewChild,
} from '@angular/core';
import { formatCount, formatVolumeCm3 } from '../../core/format';
import {
  SliceAxis,
  WINDOW_PRESETS,
  renderSlice,
  sliceLayout,
  slicePositionMm,
} from '../../voxel/slice';
import { CtVolume } from '../../voxel/volume';

export interface SurfaceStats {
  thresholdHu: number;
  triangleCount: number;
  elapsedMs: number;
  /** Voxels at or above the threshold, as a volume in mm³. */
  voxelMm3: number;
}

export interface SliceSelection {
  axis: SliceAxis;
  index: number;
}

type WindowName = keyof typeof WINDOW_PRESETS;

/** The voxel side of a case: a scrollable CT slice and the threshold that drives the 3D surface. */
@Component({
  selector: 'app-ct-panel',
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './ct-panel.html',
  styleUrl: './tool-panel.scss',
})
export class CtPanel {
  readonly volume = input.required<CtVolume | null>();
  readonly description = input.required<string>();
  readonly failed = input<string | null>(null);
  readonly thresholdHu = input.required<number>();
  readonly suggestedThresholdHu = input.required<number>();
  readonly stats = input.required<SurfaceStats | null>();
  readonly compare = input.required<boolean>();

  readonly thresholdChange = output<number>();
  readonly compareChange = output<boolean>();
  readonly sliceChange = output<SliceSelection>();

  protected readonly axis = signal<SliceAxis>('coronal');
  protected readonly index = signal(0);
  protected readonly windowName = signal<WindowName>('bone');
  protected readonly tint = signal(true);

  protected readonly layout = computed(() => {
    const volume = this.volume();
    return volume ? sliceLayout(volume, this.axis()) : null;
  });
  protected readonly positionMm = computed(() => {
    const volume = this.volume();
    return volume ? slicePositionMm(volume, this.axis(), this.index()) : 0;
  });

  protected readonly axes: { value: SliceAxis; label: string }[] = [
    { value: 'axial', label: 'Axial' },
    { value: 'coronal', label: 'Coronal' },
    { value: 'sagittal', label: 'Sagittal' },
  ];
  protected readonly windows: { value: WindowName; label: string }[] = [
    { value: 'bone', label: 'Bone' },
    { value: 'softTissue', label: 'Soft tissue' },
  ];
  protected readonly formatCount = formatCount;
  protected readonly formatVolumeCm3 = formatVolumeCm3;

  private readonly canvas = viewChild<ElementRef<HTMLCanvasElement>>('slice');
  private image: ImageData | null = null;

  constructor() {
    // Start in the middle of the stack whenever the volume or the orientation changes.
    effect(() => {
      const layout = this.layout();
      if (layout) untracked(() => this.index.set(Math.floor(layout.count / 2)));
    });

    effect(() => {
      if (this.volume()) this.sliceChange.emit({ axis: this.axis(), index: this.index() });
    });

    effect(() => {
      const volume = this.volume();
      const layout = this.layout();
      const canvas = this.canvas()?.nativeElement;
      if (!volume || !layout || !canvas) return;
      if (canvas.width !== layout.width || canvas.height !== layout.height || !this.image) {
        canvas.width = layout.width;
        canvas.height = layout.height;
        this.image = new ImageData(layout.width, layout.height);
      }
      renderSlice(
        volume,
        this.axis(),
        this.index(),
        WINDOW_PRESETS[this.windowName()],
        this.tint() ? this.thresholdHu() : null,
        this.image.data,
      );
      canvas.getContext('2d')?.putImageData(this.image, 0, 0);
    });
  }

  protected number(event: Event): number {
    return Number((event.target as HTMLInputElement).value);
  }

  protected checked(event: Event): boolean {
    return (event.target as HTMLInputElement).checked;
  }
}
