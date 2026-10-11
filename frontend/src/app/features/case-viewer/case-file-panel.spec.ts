import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { CaseDetail, CaseModel } from '../../core/api/case.models';
import { CaseFilePanel, TransitionIntent } from './case-file-panel';

const plate: CaseModel = {
  id: 'm1',
  name: 'Volar plate',
  kind: 'PLATE',
  stage: 'PLANNED',
  color: '#3E7CCB',
  triangleCount: 100,
  sizeBytes: 5084,
  fileUrl: '/api/cases/c1/models/m1/file',
};

function detail(overrides: Partial<CaseDetail>): CaseDetail {
  return {
    id: 'c1',
    reference: 'TR-2026-0001',
    title: 'Distal radius malunion',
    anatomy: 'WRIST',
    side: 'RIGHT',
    patientPseudonym: 'P-1',
    patientBirthYear: 1970,
    surgeonName: 'Dr. Surgeon',
    clinic: 'Test Clinic',
    designerName: 'D. Designer',
    status: 'AWAITING_APPROVAL',
    surgeryDate: '2026-11-05',
    planNotes: 'Opening-wedge osteotomy.',
    createdAt: '2026-10-01T08:00:00Z',
    updatedAt: '2026-10-06T15:40:00Z',
    version: 1,
    allowedActions: ['APPROVE', 'REQUEST_CHANGES'],
    models: [plate],
    volume: null,
    history: [
      {
        id: 'e1',
        fromStatus: null,
        toStatus: 'IN_DESIGN',
        action: 'CREATE',
        actor: 'Dr. Surgeon',
        comment: null,
        occurredAt: '2026-10-01T08:00:00Z',
      },
      {
        id: 'e2',
        fromStatus: 'IN_DESIGN',
        toStatus: 'AWAITING_APPROVAL',
        action: 'SUBMIT_FOR_APPROVAL',
        actor: 'D. Designer',
        comment: 'First proposal.',
        occurredAt: '2026-10-06T15:40:00Z',
      },
    ],
    ...overrides,
  };
}

describe('CaseFilePanel', () => {
  let fixture: ComponentFixture<CaseFilePanel>;
  let emitted: TransitionIntent[];
  const root = () => fixture.nativeElement as HTMLElement;
  const byTestId = <T extends HTMLElement>(id: string) =>
    root().querySelector<T>(`[data-testid="${id}"]`);

  async function render(overrides: Partial<CaseDetail> = {}) {
    TestBed.configureTestingModule({ providers: [provideRouter([])] });
    fixture = TestBed.createComponent(CaseFilePanel);
    fixture.componentRef.setInput('detail', detail(overrides));
    emitted = [];
    fixture.componentInstance.transition.subscribe((intent) => emitted.push(intent));
    await fixture.whenStable();
  }

  it('shows the newest history entry first', async () => {
    await render();
    const entries = [...root().querySelectorAll('.history li')].map((li) => li.textContent ?? '');
    expect(entries[0]).toContain('Plan submitted for approval');
    expect(entries[0]).toContain('First proposal.');
    expect(entries[1]).toContain('Case created');
  });

  it('lets the surgeon approve a plan that awaits approval', async () => {
    await render();
    byTestId<HTMLButtonElement>('approve')!.click();
    expect(emitted).toEqual([{ action: 'APPROVE' }]);
  });

  it('asks for a reason before sending a change request', async () => {
    await render();
    byTestId<HTMLButtonElement>('request-changes')!.click();
    await fixture.whenStable();

    const send = () => byTestId<HTMLButtonElement>('send-change-request')!;
    expect(send().disabled).toBe(true);

    const comment = byTestId<HTMLTextAreaElement>('change-comment')!;
    comment.value = '  Longer plate, please.  ';
    comment.dispatchEvent(new Event('input'));
    await fixture.whenStable();
    expect(send().disabled).toBe(false);

    send().click();
    expect(emitted).toEqual([{ action: 'REQUEST_CHANGES', comment: 'Longer plate, please.' }]);
  });

  it('disables every action while a request is running', async () => {
    await render();
    fixture.componentRef.setInput('busy', true);
    await fixture.whenStable();
    expect(byTestId<HTMLButtonElement>('approve')!.disabled).toBe(true);
    expect(byTestId<HTMLButtonElement>('request-changes')!.disabled).toBe(true);
  });

  it('offers nothing to decide once the plan is approved', async () => {
    await render({
      status: 'APPROVED',
      allowedActions: [],
      history: [
        ...detail({}).history,
        {
          id: 'e3',
          fromStatus: 'AWAITING_APPROVAL',
          toStatus: 'APPROVED',
          action: 'APPROVE',
          actor: 'Dr. Surgeon',
          comment: null,
          occurredAt: '2026-10-07T07:31:00Z',
        },
      ],
    });
    expect(byTestId('approve')).toBeNull();
    expect(byTestId('decision')!.textContent).toContain('Approved by Dr. Surgeon');
    expect(byTestId('decision')!.textContent).toContain('The order is binding');
  });

  it('cannot submit a case that has no plan yet', async () => {
    await render({
      status: 'IN_DESIGN',
      allowedActions: ['SUBMIT_FOR_APPROVAL'],
      models: [],
      planNotes: null,
    });
    expect(byTestId<HTMLButtonElement>('submit')!.disabled).toBe(true);
    expect(root().textContent).toContain('No plan yet');
  });

  it('shows what the server said when an action failed', async () => {
    await render();
    fixture.componentRef.setInput('error', 'This case was changed in the meantime.');
    await fixture.whenStable();
    expect(root().querySelector('[role="alert"]')!.textContent).toContain(
      'changed in the meantime',
    );
  });
});
