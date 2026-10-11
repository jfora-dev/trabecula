import { ChangeDetectionStrategy, Component, computed, input, output, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { CaseAction, CaseDetail } from '../../core/api/case.models';
import { ACTION_LABEL, SIDE_LABEL, STATUS_LABEL, describeEvent } from '../../core/api/labels';
import { formatDay, formatMoment } from '../../core/format';

export interface TransitionIntent {
  action: CaseAction;
  comment?: string;
}

/** The "paper" side of a case: who, what, the plan in words, the decision and its history. */
@Component({
  selector: 'app-case-file-panel',
  imports: [RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './case-file-panel.html',
  styleUrl: './case-file-panel.scss',
})
export class CaseFilePanel {
  readonly detail = input.required<CaseDetail>();
  readonly busy = input(false);
  readonly error = input<string | null>(null);
  readonly transition = output<TransitionIntent>();

  protected readonly requestingChanges = signal(false);
  protected readonly comment = signal('');

  protected readonly can = computed(() => new Set(this.detail().allowedActions));
  protected readonly hasPlan = computed(() =>
    this.detail().models.some((m) => m.stage === 'PLANNED'),
  );
  protected readonly approval = computed(() =>
    [...this.detail().history].reverse().find((e) => e.action === 'APPROVE'),
  );
  /** Newest first: the latest decision is what a reader looks for. */
  protected readonly history = computed(() => [...this.detail().history].reverse());

  protected readonly statusLabel = STATUS_LABEL;
  protected readonly actionLabel = ACTION_LABEL;
  protected readonly sideLabel = SIDE_LABEL;
  protected readonly describeEvent = describeEvent;
  protected readonly formatDay = formatDay;
  protected readonly formatMoment = formatMoment;

  protected send(action: CaseAction): void {
    this.transition.emit({ action });
  }

  protected sendChangeRequest(): void {
    const comment = this.comment().trim();
    if (!comment) return;
    this.transition.emit({ action: 'REQUEST_CHANGES', comment });
    this.requestingChanges.set(false);
    this.comment.set('');
  }
}
