package dev.trabecula.portal.cases.domain;

/** Where a case stands between the surgeon and the designer. */
public enum CaseStatus {
    /** The designer is preparing or revising the plan. */
    IN_DESIGN,
    /** A plan has been proposed and waits for the surgeon's decision. */
    AWAITING_APPROVAL,
    /** The surgeon has approved the plan; this is the binding order. */
    APPROVED
}
