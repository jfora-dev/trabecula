import { Injectable, inject, signal } from '@angular/core';
import { CasesApi, describeError } from './api/cases-api';

/** Restores the seeded demo cases and tells open pages to reload. */
@Injectable({ providedIn: 'root' })
export class DemoState {
  private readonly api = inject(CasesApi);

  /** Increases after every successful reset; pages reload their data when it changes. */
  readonly generation = signal(0);
  readonly busy = signal(false);
  readonly message = signal<string | null>(null);

  reset(): void {
    if (this.busy()) return;
    this.busy.set(true);
    this.message.set(null);
    this.api.resetDemo().subscribe({
      next: () => {
        this.busy.set(false);
        this.message.set('Demo data restored');
        this.generation.update((n) => n + 1);
      },
      error: (error: unknown) => {
        this.busy.set(false);
        this.message.set(describeError(error));
      },
    });
  }
}
