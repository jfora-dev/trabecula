// Shapes of the JSON exchanged with the backend. Keep in step with the Java DTOs in
// backend/src/main/java/dev/trabecula/portal/cases/api.

export type CaseStatus = 'IN_DESIGN' | 'AWAITING_APPROVAL' | 'APPROVED';
export type CaseAction = 'SUBMIT_FOR_APPROVAL' | 'APPROVE' | 'REQUEST_CHANGES';
export type Side = 'LEFT' | 'RIGHT';
export type ModelKind = 'BONE' | 'PLATE' | 'SCREW' | 'GUIDE' | 'OSTEOTOMY_PLANE';
export type PlanStage = 'PREOP' | 'PLANNED';

export interface CaseSummary {
  id: string;
  reference: string;
  title: string;
  anatomy: string;
  side: Side;
  patientPseudonym: string;
  surgeonName: string;
  clinic: string;
  status: CaseStatus;
  /** ISO date, e.g. 2026-11-05 */
  surgeryDate: string;
  /** ISO instant */
  updatedAt: string;
}

export interface CaseDetail extends CaseSummary {
  patientBirthYear: number;
  designerName: string;
  planNotes: string | null;
  createdAt: string;
  /** Optimistic-lock version; send it back with every transition. */
  version: number;
  allowedActions: CaseAction[];
  models: CaseModel[];
  volume: CtVolumeInfo | null;
  history: StatusEvent[];
}

export interface CaseModel {
  id: string;
  name: string;
  kind: ModelKind;
  stage: PlanStage;
  /** #RRGGBB */
  color: string;
  triangleCount: number;
  sizeBytes: number;
  /** Binary STL, millimetres, same frame as the CT volume. */
  fileUrl: string;
}

export interface CtVolumeInfo {
  id: string;
  description: string;
  dimensions: [number, number, number];
  spacingMm: [number, number, number];
  originMm: [number, number, number];
  rescaleSlope: number;
  rescaleIntercept: number;
  suggestedBoneThresholdHu: number;
  /** Little-endian int16, x fastest, then y, then z. */
  dataUrl: string;
}

export interface StatusEvent {
  id: string;
  fromStatus: CaseStatus | null;
  toStatus: CaseStatus;
  action: 'CREATE' | CaseAction;
  actor: string;
  comment: string | null;
  occurredAt: string;
}

export interface TransitionRequest {
  action: CaseAction;
  expectedVersion: number;
  comment?: string;
}

/** RFC 9457 problem details, as returned for every 4xx / 5xx. */
export interface Problem {
  type?: string;
  title?: string;
  status?: number;
  detail?: string;
  code?: string;
}
