package dev.trabecula.portal.cases.api;

import dev.trabecula.portal.cases.domain.CaseAction;
import dev.trabecula.portal.cases.domain.CaseStatus;
import dev.trabecula.portal.cases.domain.Side;
import java.time.Instant;
import java.time.LocalDate;
import java.util.List;
import java.util.UUID;

/**
 * Everything the review page needs about one case.
 *
 * @param version send this back as {@code expectedVersion} when taking an action
 * @param allowedActions what the workflow permits right now, so clients need not copy its rules
 * @param volume null while no scan has been uploaded
 */
public record CaseDetailDto(
        UUID id,
        String reference,
        String title,
        String anatomy,
        Side side,
        String patientPseudonym,
        int patientBirthYear,
        String surgeonName,
        String clinic,
        String designerName,
        CaseStatus status,
        LocalDate surgeryDate,
        String planNotes,
        Instant createdAt,
        Instant updatedAt,
        long version,
        List<CaseAction> allowedActions,
        List<CaseModelDto> models,
        CtVolumeDto volume,
        List<StatusEventDto> history) {}
