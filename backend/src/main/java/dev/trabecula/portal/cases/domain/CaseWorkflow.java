package dev.trabecula.portal.cases.domain;

import java.util.EnumSet;
import java.util.Map;
import java.util.Set;

/**
 * The approval workflow as a table.
 *
 * <pre>
 *   IN_DESIGN --SUBMIT_FOR_APPROVAL--> AWAITING_APPROVAL --APPROVE--> APPROVED
 *       ^                                     |
 *       +----------REQUEST_CHANGES------------+
 * </pre>
 *
 * APPROVED is final: approval is the binding order, so it cannot be taken back here.
 */
public final class CaseWorkflow {

    private record Step(CaseStatus from, CaseAction action) {}

    private static final Map<Step, CaseStatus> TRANSITIONS = Map.of(
            new Step(CaseStatus.IN_DESIGN, CaseAction.SUBMIT_FOR_APPROVAL), CaseStatus.AWAITING_APPROVAL,
            new Step(CaseStatus.AWAITING_APPROVAL, CaseAction.APPROVE), CaseStatus.APPROVED,
            new Step(CaseStatus.AWAITING_APPROVAL, CaseAction.REQUEST_CHANGES), CaseStatus.IN_DESIGN);

    private CaseWorkflow() {}

    /** Actions that may be taken on a case in the given status, in declaration order. */
    public static Set<CaseAction> allowedActions(CaseStatus status) {
        EnumSet<CaseAction> allowed = EnumSet.noneOf(CaseAction.class);
        for (Step step : TRANSITIONS.keySet()) {
            if (step.from() == status) {
                allowed.add(step.action());
            }
        }
        return allowed;
    }

    /**
     * @return the status the action leads to
     * @throws IllegalTransitionException if the action is not allowed in this status
     */
    public static CaseStatus next(CaseStatus status, CaseAction action) {
        CaseStatus target = TRANSITIONS.get(new Step(status, action));
        if (target == null) {
            throw IllegalTransitionException.notAllowed(status, action);
        }
        return target;
    }
}
