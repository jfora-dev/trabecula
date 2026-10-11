package dev.trabecula.portal.cases.api;

import dev.trabecula.portal.cases.domain.CaseModel;
import dev.trabecula.portal.cases.domain.CtVolume;
import dev.trabecula.portal.cases.domain.StatusEvent;
import dev.trabecula.portal.cases.domain.SurgicalCase;
import java.util.List;
import java.util.UUID;

/** Entity to DTO. Must run inside a transaction: it walks lazy collections. */
public final class CaseMapper {

    private CaseMapper() {}

    public static CaseSummaryDto toSummary(SurgicalCase c) {
        return new CaseSummaryDto(
                c.getId(),
                c.getReference(),
                c.getTitle(),
                c.getAnatomy(),
                c.getSide(),
                c.getPatientPseudonym(),
                c.getSurgeonName(),
                c.getClinic(),
                c.getStatus(),
                c.getSurgeryDate(),
                c.getUpdatedAt());
    }

    public static CaseDetailDto toDetail(SurgicalCase c) {
        UUID caseId = c.getId();
        return new CaseDetailDto(
                caseId,
                c.getReference(),
                c.getTitle(),
                c.getAnatomy(),
                c.getSide(),
                c.getPatientPseudonym(),
                c.getPatientBirthYear(),
                c.getSurgeonName(),
                c.getClinic(),
                c.getDesignerName(),
                c.getStatus(),
                c.getSurgeryDate(),
                c.getPlanNotes(),
                c.getCreatedAt(),
                c.getUpdatedAt(),
                c.getVersion() == null ? 0L : c.getVersion(),
                List.copyOf(c.allowedActions()),
                c.getModels().stream().map(model -> toModel(caseId, model)).toList(),
                c.getVolume() == null ? null : toVolume(caseId, c.getVolume()),
                c.getHistory().stream().map(CaseMapper::toEvent).toList());
    }

    private static CaseModelDto toModel(UUID caseId, CaseModel m) {
        return new CaseModelDto(
                m.getId(),
                m.getName(),
                m.getKind(),
                m.getStage(),
                m.getColor(),
                m.getTriangleCount(),
                m.getSizeBytes(),
                "/api/cases/" + caseId + "/models/" + m.getId() + "/file");
    }

    private static CtVolumeDto toVolume(UUID caseId, CtVolume v) {
        return new CtVolumeDto(
                v.getId(),
                v.getDescription(),
                v.getDimensions(),
                v.getSpacingMm(),
                v.getOriginMm(),
                v.getRescaleSlope(),
                v.getRescaleIntercept(),
                v.getSuggestedBoneThresholdHu(),
                "/api/cases/" + caseId + "/volume/data");
    }

    private static StatusEventDto toEvent(StatusEvent e) {
        return new StatusEventDto(
                e.getId(),
                e.getFromStatus(),
                e.getToStatus(),
                e.getAction(),
                e.getActor(),
                e.getComment(),
                e.getOccurredAt());
    }
}
