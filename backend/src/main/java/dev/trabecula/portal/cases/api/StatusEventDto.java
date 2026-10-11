package dev.trabecula.portal.cases.api;

import dev.trabecula.portal.cases.domain.CaseAction;
import dev.trabecula.portal.cases.domain.CaseStatus;
import java.time.Instant;
import java.util.UUID;

/** One entry of the audit trail. {@code fromStatus} is null for the creation of the case. */
public record StatusEventDto(
        UUID id,
        CaseStatus fromStatus,
        CaseStatus toStatus,
        CaseAction action,
        String actor,
        String comment,
        Instant occurredAt) {}
