import { HttpErrorResponse, provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { CtVolumeInfo } from './case.models';
import { CasesApi, describeError, toVolume } from './cases-api';

const info: CtVolumeInfo = {
  id: 'v1',
  description: 'test',
  dimensions: [2, 2, 1],
  spacingMm: [0.6, 0.6, 0.6],
  originMm: [-1, -2, 0],
  rescaleSlope: 1,
  rescaleIntercept: -1024,
  suggestedBoneThresholdHu: 300,
  dataUrl: '/api/cases/c1/volume/data',
};

describe('CasesApi', () => {
  let api: CasesApi;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    api = TestBed.inject(CasesApi);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('posts a transition with the expected version', () => {
    api.transition('c1', { action: 'APPROVE', expectedVersion: 3 }).subscribe();
    const request = http.expectOne('/api/cases/c1/transitions');
    expect(request.request.method).toBe('POST');
    expect(request.request.body).toEqual({ action: 'APPROVE', expectedVersion: 3 });
    request.flush({});
  });

  it('decodes the CT volume into int16 voxels with its geometry', () => {
    let voxels: number[] = [];
    api.volume(info).subscribe((volume) => {
      voxels = Array.from(volume.data);
      expect(volume.dims).toEqual([2, 2, 1]);
      expect(volume.rescaleIntercept).toBe(-1024);
    });
    http.expectOne(info.dataUrl).flush(Int16Array.from([0, 1024, 2048, -5]).buffer);
    expect(voxels).toEqual([0, 1024, 2048, -5]);
  });
});

describe('toVolume', () => {
  it('rejects a payload whose size does not match the dimensions', () => {
    expect(() => toVolume(info, new ArrayBuffer(6))).toThrow(/expected 8/);
  });
});

describe('describeError', () => {
  it('prefers the detail of a problem response', () => {
    const error = new HttpErrorResponse({
      status: 409,
      error: { title: 'Conflict', detail: 'Already approved.' },
    });
    expect(describeError(error)).toBe('Already approved.');
  });

  it('explains an unreachable server', () => {
    expect(describeError(new HttpErrorResponse({ status: 0 }))).toContain('cannot be reached');
  });

  it('falls back to the status code', () => {
    expect(describeError(new HttpErrorResponse({ status: 500, error: 'boom' }))).toContain('500');
  });
});
