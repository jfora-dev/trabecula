package dev.trabecula.portal.web;

import dev.trabecula.portal.assets.AssetUnavailableException;
import dev.trabecula.portal.cases.CaseNotFoundException;
import dev.trabecula.portal.cases.StaleCaseException;
import dev.trabecula.portal.cases.domain.IllegalTransitionException;
import dev.trabecula.portal.cases.domain.InvalidTransitionRequestException;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.HttpStatus;
import org.springframework.http.ProblemDetail;
import org.springframework.orm.ObjectOptimisticLockingFailureException;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;
import org.springframework.web.servlet.mvc.method.annotation.ResponseEntityExceptionHandler;

/**
 * Turns every failure into an RFC 9457 problem document.
 *
 * <p>The base class covers Spring MVC's own errors (malformed JSON, failed validation, a path
 * id that is not a UUID). The handlers below add the application's. {@code detail} is written
 * for the person using the portal; {@code code} is for client code that needs to tell cases apart.
 */
@RestControllerAdvice
public class ApiExceptionHandler extends ResponseEntityExceptionHandler {

    private static final Logger log = LoggerFactory.getLogger(ApiExceptionHandler.class);

    @ExceptionHandler(CaseNotFoundException.class)
    public ProblemDetail notFound(CaseNotFoundException e) {
        return problem(HttpStatus.NOT_FOUND, "Not found", "NOT_FOUND", e.getMessage());
    }

    @ExceptionHandler(IllegalTransitionException.class)
    public ProblemDetail illegalTransition(IllegalTransitionException e) {
        return problem(HttpStatus.CONFLICT, "Action not allowed", "ILLEGAL_TRANSITION", e.getMessage());
    }

    @ExceptionHandler(InvalidTransitionRequestException.class)
    public ProblemDetail invalidTransitionRequest(InvalidTransitionRequestException e) {
        return problem(HttpStatus.BAD_REQUEST, "Incomplete request", "INVALID_TRANSITION_REQUEST", e.getMessage());
    }

    /** Either our own version check failed, or two requests raced and the database caught it. */
    @ExceptionHandler({StaleCaseException.class, ObjectOptimisticLockingFailureException.class})
    public ProblemDetail stale(Exception e) {
        return problem(HttpStatus.CONFLICT, "Case has changed", "STALE_VERSION", new StaleCaseException().getMessage());
    }

    @ExceptionHandler(AssetUnavailableException.class)
    public ProblemDetail assetUnavailable(AssetUnavailableException e) {
        log.error("Asset missing from storage", e);
        return problem(
                HttpStatus.INTERNAL_SERVER_ERROR,
                "File unavailable",
                "ASSET_UNAVAILABLE",
                "A file of this case could not be read. The problem has been logged.");
    }

    private static ProblemDetail problem(HttpStatus status, String title, String code, String detail) {
        ProblemDetail problem = ProblemDetail.forStatusAndDetail(status, detail);
        problem.setTitle(title);
        problem.setProperty("code", code);
        return problem;
    }
}
