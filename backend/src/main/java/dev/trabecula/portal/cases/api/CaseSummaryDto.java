package dev.trabecula.portal.cases.api;

import dev.trabecula.portal.cases.domain.CaseStatus;
import dev.trabecula.portal.cases.domain.Side;
import java.time.Instant;
import java.time.LocalDate;
import java.util.UUID;

/** A row of the case list. */
public record CaseSummaryDto(
        UUID id,
        String reference,
        String title,
        String anatomy,
        Side side,
        String patientPseudonym,
        String surgeonName,
        String clinic,
        CaseStatus status,
        LocalDate surgeryDate,
        Instant updatedAt) {}
