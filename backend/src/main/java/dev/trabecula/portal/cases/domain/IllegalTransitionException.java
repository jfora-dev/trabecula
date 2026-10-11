package dev.trabecula.portal.cases.domain;

/** The requested action does not fit the current state of the case. */
public class IllegalTransitionException extends RuntimeException {

    public IllegalTransitionException(String message) {
        super(message);
    }

    static IllegalTransitionException notAllowed(CaseStatus status, CaseAction action) {
        return new IllegalTransitionException("A case that is %s cannot take the action %s."
                .formatted(describe(status), action.name().toLowerCase().replace('_', ' ')));
    }

    private static String describe(CaseStatus status) {
        return switch (status) {
            case IN_DESIGN -> "in design";
            case AWAITING_APPROVAL -> "awaiting approval";
            case APPROVED -> "approved";
        };
    }
}
