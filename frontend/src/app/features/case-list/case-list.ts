import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  signal,
} from '@angular/core';
import { RouterLink } from '@angular/router';
import { CaseStatus, CaseSummary } from '../../core/api/case.models';
import { CasesApi, describeError } from '../../core/api/cases-api';
import { SIDE_LABEL, STATUS_LABEL } from '../../core/api/labels';
import { DemoState } from '../../core/demo-state';
import { formatDay } from '../../core/format';

type Filter = CaseStatus | 'ALL';

@Component({
  selector: 'app-case-list',
  imports: [RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './case-list.html',
  styleUrl: './case-list.scss',
})
export class CaseList {
  private readonly api = inject(CasesApi);
  private readonly demo = inject(DemoState);

  protected readonly cases = signal<CaseSummary[] | null>(null);
  protected readonly error = signal<string | null>(null);
  protected readonly filter = signal<Filter>('ALL');

  protected readonly filters: { value: Filter; label: string }[] = [
    { value: 'ALL', label: 'All' },
    { value: 'AWAITING_APPROVAL', label: STATUS_LABEL.AWAITING_APPROVAL },
    { value: 'IN_DESIGN', label: STATUS_LABEL.IN_DESIGN },
    { value: 'APPROVED', label: STATUS_LABEL.APPROVED },
  ];

  protected readonly visible = computed(() => {
    const filter = this.filter();
    return (this.cases() ?? []).filter((c) => filter === 'ALL' || c.status === filter);
  });

  protected readonly statusLabel = STATUS_LABEL;
  protected readonly sideLabel = SIDE_LABEL;
  protected readonly formatDay = formatDay;

  constructor() {
    // Runs once at start and again after every demo reset.
    effect(() => {
      this.demo.generation();
      this.load();
    });
  }

  protected load(): void {
    this.error.set(null);
    this.api.list().subscribe({
      next: (cases) => this.cases.set(cases),
      error: (error: unknown) => this.error.set(describeError(error)),
    });
  }
}
