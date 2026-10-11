import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { CaseSummary } from '../../core/api/case.models';
import { CaseList } from './case-list';

function summary(overrides: Partial<CaseSummary>): CaseSummary {
  return {
    id: 'id-1',
    reference: 'TR-2026-0001',
    title: 'Distal radius malunion',
    anatomy: 'WRIST',
    side: 'RIGHT',
    patientPseudonym: 'P-1',
    surgeonName: 'Dr. Test',
    clinic: 'Demo Clinic',
    status: 'IN_DESIGN',
    surgeryDate: '2026-11-05',
    updatedAt: '2026-10-01T08:00:00Z',
    ...overrides,
  };
}

describe('CaseList', () => {
  let fixture: ComponentFixture<CaseList>;
  let http: HttpTestingController;
  const text = () => (fixture.nativeElement as HTMLElement).textContent ?? '';
  const rows = () => (fixture.nativeElement as HTMLElement).querySelectorAll('tbody tr');

  beforeEach(async () => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter([])],
    });
    fixture = TestBed.createComponent(CaseList);
    http = TestBed.inject(HttpTestingController);
    await fixture.whenStable();
  });

  it('lists the cases with a link, a readable date and the status', async () => {
    http.expectOne('/api/cases').flush([summary({ id: 'abc', status: 'AWAITING_APPROVAL' })]);
    await fixture.whenStable();

    expect(rows().length).toBe(1);
    expect(text()).toContain('TR-2026-0001');
    expect(text()).toContain('5 Nov 2026');
    expect(text()).toContain('Awaiting approval');
    expect(rows()[0].querySelector('a')?.getAttribute('href')).toBe('/cases/abc');
  });

  it('filters by status', async () => {
    http
      .expectOne('/api/cases')
      .flush([
        summary({ id: 'a', reference: 'TR-A', status: 'APPROVED' }),
        summary({ id: 'b', reference: 'TR-B', status: 'IN_DESIGN' }),
      ]);
    await fixture.whenStable();
    expect(rows().length).toBe(2);

    const approved = [
      ...(fixture.nativeElement as HTMLElement).querySelectorAll<HTMLButtonElement>(
        '.segmented button',
      ),
    ].find((b) => b.textContent?.trim() === 'Approved');
    approved!.click();
    await fixture.whenStable();

    expect(rows().length).toBe(1);
    expect(text()).toContain('TR-A');
    expect(text()).not.toContain('TR-B');
  });

  it('explains a failed request and retries on demand', async () => {
    http
      .expectOne('/api/cases')
      .flush(
        { detail: 'Database is starting up.' },
        { status: 503, statusText: 'Service Unavailable' },
      );
    await fixture.whenStable();
    expect(text()).toContain('Database is starting up.');

    (fixture.nativeElement as HTMLElement)
      .querySelector<HTMLButtonElement>('.notice button')!
      .click();
    http.expectOne('/api/cases').flush([summary({})]);
    await fixture.whenStable();
    expect(rows().length).toBe(1);
  });
});
