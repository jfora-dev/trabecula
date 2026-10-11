package dev.trabecula.portal.cases.api;

import dev.trabecula.portal.cases.domain.ModelKind;
import dev.trabecula.portal.cases.domain.PlanStage;
import java.util.UUID;

/** @param fileUrl where to download the binary STL (millimetres, same frame as the CT volume) */
public record CaseModelDto(
        UUID id,
        String name,
        ModelKind kind,
        PlanStage stage,
        String color,
        int triangleCount,
        long sizeBytes,
        String fileUrl) {}
