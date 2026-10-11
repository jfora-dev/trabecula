package dev.trabecula.portal.cases.domain;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.time.Instant;
import java.time.LocalDate;
import java.util.UUID;
import org.junit.jupiter.api.Test;

class SurgicalCaseTest {

    private static final Instant CREATED = Instant.parse("2026-10-01T08:00:00Z");
    private static final Instant LATER = Instant.parse("2026-10-06T15:30:00Z");

    private static SurgicalCase newCase() {
        return new SurgicalCase(
                UUID.randomUUID(),
                "TR-TEST-0001",
                "Distal radius malunion",
                "WRIST",
                Side.RIGHT,
                "P-00001",
                1970,
                "Dr. Surgeon",
                "Test Clinic",
                "D. Designer",
                LocalDate.parse("2026-11-05"),
                CREATED);
    }

    private static SurgicalCase plannedCase() {
        SurgicalCase surgicalCase = newCase();
        surgicalCase.addModel(new CaseModel(
                UUID.randomUUID(), surgicalCase, 0, "Volar plate", ModelKind.PLATE, PlanStage.PLANNED,
                "#3E7CCB", "test/plate.stl", 100, 5084));
        return surgicalCase;
    }

    @Test
    void aNewCaseStartsInDesign() {
        SurgicalCase surgicalCase = newCase();
        assertThat(surgicalCase.getStatus()).isEqualTo(CaseStatus.IN_DESIGN);
        assertThat(surgicalCase.getUpdatedAt()).isEqualTo(CREATED);
        assertThat(surgicalCase.getHistory()).isEmpty();
    }

    @Test
    void submittingRecordsTheDesignerAndMovesTheCaseOn() {
        SurgicalCase surgicalCase = plannedCase();

        StatusEvent event = surgicalCase.apply(CaseAction.SUBMIT_FOR_APPROVAL, "  First proposal.  ", LATER);

        assertThat(surgicalCase.getStatus()).isEqualTo(CaseStatus.AWAITING_APPROVAL);
        assertThat(surgicalCase.getUpdatedAt()).isEqualTo(LATER);
        assertThat(surgicalCase.getHistory()).containsExactly(event);
        assertThat(event.getFromStatus()).isEqualTo(CaseStatus.IN_DESIGN);
        assertThat(event.getToStatus()).isEqualTo(CaseStatus.AWAITING_APPROVAL);
        assertThat(event.getActor()).isEqualTo("D. Designer");
        assertThat(event.getComment()).isEqualTo("First proposal.");
        assertThat(event.getOccurredAt()).isEqualTo(LATER);
    }

    @Test
    void aCaseWithoutAPlanCannotBeSubmitted() {
        SurgicalCase surgicalCase = newCase();

        assertThatThrownBy(() -> surgicalCase.apply(CaseAction.SUBMIT_FOR_APPROVAL, null, LATER))
                .isInstanceOf(IllegalTransitionException.class)
                .hasMessageContaining("no planned result");
        assertThat(surgicalCase.getStatus()).isEqualTo(CaseStatus.IN_DESIGN);
        assertThat(surgicalCase.getHistory()).isEmpty();
    }

    @Test
    void approvingRecordsTheSurgeonAndIsFinal() {
        SurgicalCase surgicalCase = plannedCase();
        surgicalCase.apply(CaseAction.SUBMIT_FOR_APPROVAL, null, LATER);

        StatusEvent event = surgicalCase.apply(CaseAction.APPROVE, null, LATER.plusSeconds(60));

        assertThat(surgicalCase.getStatus()).isEqualTo(CaseStatus.APPROVED);
        assertThat(event.getActor()).isEqualTo("Dr. Surgeon");
        assertThat(event.getComment()).isNull();
        assertThat(surgicalCase.allowedActions()).isEmpty();
        assertThatThrownBy(() -> surgicalCase.apply(CaseAction.REQUEST_CHANGES, "Too late", LATER.plusSeconds(120)))
                .isInstanceOf(IllegalTransitionException.class);
    }

    @Test
    void requestingChangesNeedsAReason() {
        SurgicalCase surgicalCase = plannedCase();
        surgicalCase.apply(CaseAction.SUBMIT_FOR_APPROVAL, null, LATER);

        assertThatThrownBy(() -> surgicalCase.apply(CaseAction.REQUEST_CHANGES, "   ", LATER))
                .isInstanceOf(InvalidTransitionRequestException.class);
        assertThat(surgicalCase.getStatus()).isEqualTo(CaseStatus.AWAITING_APPROVAL);

        surgicalCase.apply(CaseAction.REQUEST_CHANGES, "Move the plate 2 mm proximal.", LATER);
        assertThat(surgicalCase.getStatus()).isEqualTo(CaseStatus.IN_DESIGN);
        assertThat(surgicalCase.getHistory()).hasSize(2);
        assertThat(surgicalCase.getHistory().get(1).getComment()).isEqualTo("Move the plate 2 mm proximal.");
    }

    @Test
    void anActionThatDoesNotFitLeavesTheCaseUntouched() {
        SurgicalCase surgicalCase = plannedCase();

        assertThatThrownBy(() -> surgicalCase.apply(CaseAction.APPROVE, null, LATER))
                .isInstanceOf(IllegalTransitionException.class);
        assertThat(surgicalCase.getStatus()).isEqualTo(CaseStatus.IN_DESIGN);
        assertThat(surgicalCase.getUpdatedAt()).isEqualTo(CREATED);
        assertThat(surgicalCase.getHistory()).isEmpty();
    }
}
