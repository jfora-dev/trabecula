package dev.trabecula.portal.cases.domain;

/** The action is allowed, but the request for it is incomplete. */
public class InvalidTransitionRequestException extends RuntimeException {

    public InvalidTransitionRequestException(String message) {
        super(message);
    }
}
