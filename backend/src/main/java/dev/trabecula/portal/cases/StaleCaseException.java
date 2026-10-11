package dev.trabecula.portal.cases;

/** The caller acted on a version of the case that is no longer the current one. */
public class StaleCaseException extends RuntimeException {

    public StaleCaseException() {
        super("This case was changed in the meantime. Reload it and try again.");
    }
}
