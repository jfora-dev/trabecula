package dev.trabecula.portal.cases.domain;

/** Something that happened to a case. All but {@link #CREATE} can be requested through the API. */
public enum CaseAction {
    CREATE,
    SUBMIT_FOR_APPROVAL,
    APPROVE,
    REQUEST_CHANGES
}
