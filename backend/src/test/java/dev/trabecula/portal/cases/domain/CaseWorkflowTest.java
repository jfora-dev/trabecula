package dev.trabecula.portal.cases.domain;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.EnumSource;

class CaseWorkflowTest {

    @Test
    void aCaseInDesignCanOnlyBeSubmitted() {
        assertThat(CaseWorkflow.allowedActions(CaseStatus.IN_DESIGN)).containsExactly(CaseAction.SUBMIT_FOR_APPROVAL);
        assertThat(CaseWorkflow.next(CaseStatus.IN_DESIGN, CaseAction.SUBMIT_FOR_APPROVAL))
                .isEqualTo(CaseStatus.AWAITING_APPROVAL);
    }

    @Test
    void aSubmittedCaseCanBeApprovedOrSentBack() {
        assertThat(CaseWorkflow.allowedActions(CaseStatus.AWAITING_APPROVAL))
                .containsExactly(CaseAction.APPROVE, CaseAction.REQUEST_CHANGES);
        assertThat(CaseWorkflow.next(CaseStatus.AWAITING_APPROVAL, CaseAction.APPROVE))
                .isEqualTo(CaseStatus.APPROVED);
        assertThat(CaseWorkflow.next(CaseStatus.AWAITING_APPROVAL, CaseAction.REQUEST_CHANGES))
                .isEqualTo(CaseStatus.IN_DESIGN);
    }

    @ParameterizedTest
    @EnumSource(CaseAction.class)
    void anApprovedCaseIsFinal(CaseAction action) {
        assertThat(CaseWorkflow.allowedActions(CaseStatus.APPROVED)).isEmpty();
        assertThatThrownBy(() -> CaseWorkflow.next(CaseStatus.APPROVED, action))
                .isInstanceOf(IllegalTransitionException.class)
                .hasMessageContaining("approved");
    }

    @ParameterizedTest
    @EnumSource(CaseStatus.class)
    void creatingIsNeverAnActionOnAnExistingCase(CaseStatus status) {
        assertThat(CaseWorkflow.allowedActions(status)).doesNotContain(CaseAction.CREATE);
        assertThatThrownBy(() -> CaseWorkflow.next(status, CaseAction.CREATE))
                .isInstanceOf(IllegalTransitionException.class);
    }

    @Test
    void aCaseInDesignCannotBeApprovedDirectly() {
        assertThatThrownBy(() -> CaseWorkflow.next(CaseStatus.IN_DESIGN, CaseAction.APPROVE))
                .isInstanceOf(IllegalTransitionException.class)
                .hasMessage("A case that is in design cannot take the action approve.");
    }
}
