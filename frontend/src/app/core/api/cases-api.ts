import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, map } from 'rxjs';
import { CtVolume } from '../../voxel/volume';
import { CaseDetail, CaseSummary, CtVolumeInfo, Problem, TransitionRequest } from './case.models';

@Injectable({ providedIn: 'root' })
export class CasesApi {
  private readonly http = inject(HttpClient);

  list(): Observable<CaseSummary[]> {
    return this.http.get<CaseSummary[]>('/api/cases');
  }

  get(id: string): Observable<CaseDetail> {
    return this.http.get<CaseDetail>(`/api/cases/${encodeURIComponent(id)}`);
  }

  transition(id: string, request: TransitionRequest): Observable<CaseDetail> {
    return this.http.post<CaseDetail>(`/api/cases/${encodeURIComponent(id)}/transitions`, request);
  }

  modelFile(url: string): Observable<ArrayBuffer> {
    return this.http.get(url, { responseType: 'arraybuffer' });
  }

  volume(info: CtVolumeInfo): Observable<CtVolume> {
    return this.http
      .get(info.dataUrl, { responseType: 'arraybuffer' })
      .pipe(map((buffer) => toVolume(info, buffer)));
  }

  resetDemo(): Observable<void> {
    return this.http.post<void>('/api/demo/reset', null);
  }
}

export function toVolume(info: CtVolumeInfo, buffer: ArrayBuffer): CtVolume {
  const [nx, ny, nz] = info.dimensions;
  const expected = nx * ny * nz * Int16Array.BYTES_PER_ELEMENT;
  if (buffer.byteLength !== expected) {
    throw new Error(
      `CT volume has ${buffer.byteLength} bytes, expected ${expected} for ${nx} x ${ny} x ${nz}`,
    );
  }
  // The file is little-endian, and so is every platform browsers run on today.
  return {
    data: new Int16Array(buffer),
    dims: info.dimensions,
    spacing: info.spacingMm,
    origin: info.originMm,
    rescaleSlope: info.rescaleSlope,
    rescaleIntercept: info.rescaleIntercept,
  };
}

/** A sentence a user can act on, whatever went wrong with the request. */
export function describeError(error: unknown): string {
  if (error instanceof HttpErrorResponse) {
    if (error.status === 0)
      return 'The server cannot be reached. Check that the backend is running.';
    const problem = error.error as Problem | null;
    if (problem && typeof problem === 'object' && problem.detail) return problem.detail;
    return `The server answered with an error (${error.status}).`;
  }
  return error instanceof Error ? error.message : 'Something went wrong.';
}
