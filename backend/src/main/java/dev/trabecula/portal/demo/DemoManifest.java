package dev.trabecula.portal.demo;

import com.fasterxml.jackson.annotation.JsonIgnoreProperties;
import dev.trabecula.portal.cases.domain.CaseAction;
import dev.trabecula.portal.cases.domain.CaseStatus;
import dev.trabecula.portal.cases.domain.ModelKind;
import dev.trabecula.portal.cases.domain.PlanStage;
import dev.trabecula.portal.cases.domain.Side;
import java.time.Instant;
import java.time.LocalDate;
import java.util.List;

/** Shape of {@code demo-assets/manifest.json}, written by {@code tools/demo-data/generate.py}. */
@JsonIgnoreProperties(ignoreUnknown = true)
record DemoManifest(List<DemoCase> cases) {

    @JsonIgnoreProperties(ignoreUnknown = true)
    record DemoCase(
            String key,
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
            Instant createdAt,
            String planNotes,
            List<DemoModel> models,
            DemoVolume volume,
            List<DemoEvent> history) {}

    @JsonIgnoreProperties(ignoreUnknown = true)
    record DemoModel(
            String name, ModelKind kind, PlanStage stage, String color, String file, int triangleCount, long sizeBytes) {}

    @JsonIgnoreProperties(ignoreUnknown = true)
    record DemoVolume(
            String file,
            String description,
            int[] dimensions,
            double[] spacingMm,
            double[] originMm,
            double rescaleSlope,
            double rescaleIntercept,
            int suggestedBoneThresholdHu) {}

    @JsonIgnoreProperties(ignoreUnknown = true)
    record DemoEvent(
            Instant at, CaseStatus fromStatus, CaseStatus toStatus, CaseAction action, String actor, String comment) {}
}
