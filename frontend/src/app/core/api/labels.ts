import { CaseAction, CaseStatus, Side, StatusEvent } from './case.models';

export const STATUS_LABEL: Record<CaseStatus, string> = {
  IN_DESIGN: 'In design',
  AWAITING_APPROVAL: 'Awaiting approval',
  APPROVED: 'Approved',
};

export const ACTION_LABEL: Record<CaseAction, string> = {
  SUBMIT_FOR_APPROVAL: 'Submit for approval',
  APPROVE: 'Approve plan',
  REQUEST_CHANGES: 'Request changes',
};

export const SIDE_LABEL: Record<Side, string> = { LEFT: 'Left', RIGHT: 'Right' };

export function describeEvent(event: StatusEvent): string {
  switch (event.action) {
    case 'CREATE':
      return 'Case created';
    case 'SUBMIT_FOR_APPROVAL':
      return 'Plan submitted for approval';
    case 'APPROVE':
      return 'Plan approved';
    case 'REQUEST_CHANGES':
      return 'Changes requested';
  }
}
