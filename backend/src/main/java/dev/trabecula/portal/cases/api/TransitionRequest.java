package dev.trabecula.portal.cases.api;

import dev.trabecula.portal.cases.domain.CaseAction;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

/**
 * A request to move a case through the workflow.
 *
 * @param expectedVersion the {@code version} of the case the caller was looking at
 * @param comment required for REQUEST_CHANGES, optional otherwise
 */
public record TransitionRequest(
        @NotNull CaseAction action,
        @NotNull Long expectedVersion,
        @Size(max = 2000) String comment) {}
