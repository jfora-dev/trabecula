import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { CaseModel, PlanStage } from '../../core/api/case.models';
import { formatCount } from '../../core/format';
import { Measurement, formatDistance } from '../../viewer3d/measurement';
import { LayerDisplay } from '../../viewer3d/scene-engine';

/** Controls for reviewing the plan: which stage, which models, and the measuring tool. */
@Component({
  selector: 'app-plan-panel',
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './plan-panel.html',
  styleUrl: './tool-panel.scss',
})
export class PlanPanel {
  readonly models = input.required<CaseModel[]>();
  readonly stage = input.required<PlanStage>();
  readonly hasPlan = input.required<boolean>();
  readonly display = input.required<Readonly<Record<string, LayerDisplay>>>();
  readonly measuring = input.required<boolean>();
  readonly measurements = input.required<readonly Measurement[]>();

  readonly stageChange = output<PlanStage>();
  readonly displayChange = output<{ modelId: string; display: LayerDisplay }>();
  readonly measuringChange = output<boolean>();
  readonly removeMeasurement = output<number>();
  readonly clearMeasurements = output<void>();

  protected readonly displays: { value: LayerDisplay; label: string }[] = [
    { value: 'solid', label: 'Solid' },
    { value: 'ghost', label: 'See-through' },
    { value: 'hidden', label: 'Hidden' },
  ];

  protected readonly formatCount = formatCount;
  protected readonly formatDistance = formatDistance;
}
