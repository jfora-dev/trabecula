package dev.trabecula.portal.cases;

/** Nothing exists under the requested id, whether a case, one of its models or its scan. */
public class CaseNotFoundException extends RuntimeException {

    public CaseNotFoundException(String message) {
        super(message);
    }
}
