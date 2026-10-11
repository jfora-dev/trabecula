package dev.trabecula.portal.cases.domain;

import jakarta.persistence.CascadeType;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.Id;
import jakarta.persistence.OneToMany;
import jakarta.persistence.OneToOne;
import jakarta.persistence.OrderBy;
import jakarta.persistence.Table;
import jakarta.persistence.Version;
import java.time.Instant;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.Collections;
import java.util.List;
import java.util.Set;
import java.util.UUID;

/**
 * One patient-specific case: who it is for, its 3D data, and where it stands in the approval
 * workflow. The workflow rules live here, next to the state they protect.
 */
@Entity
@Table(name = "surgical_case")
public class SurgicalCase {

    @Id
    private UUID id;

    /** Optimistic lock. Null until the row is first written. */
    @Version
    private Long version;

    @Column(nullable = false, unique = true)
    private String reference;

    @Column(nullable = false)
    private String title;

    @Column(nullable = false)
    private String anatomy;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false)
    private Side side;

    /** Cases carry a pseudonym only; the portal never stores a patient's name. */
    @Column(nullable = false)
    private String patientPseudonym;

    @Column(nullable = false)
    private int patientBirthYear;

    @Column(nullable = false)
    private String surgeonName;

    @Column(nullable = false)
    private String clinic;

    @Column(nullable = false)
    private String designerName;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false)
    private CaseStatus status;

    @Column(nullable = false)
    private LocalDate surgeryDate;

    private String planNotes;

    @Column(nullable = false)
    private Instant createdAt;

    @Column(nullable = false)
    private Instant updatedAt;

    @OneToMany(mappedBy = "surgicalCase", cascade = CascadeType.ALL, orphanRemoval = true)
    @OrderBy("sortOrder ASC")
    private List<CaseModel> models = new ArrayList<>();

    @OneToOne(mappedBy = "surgicalCase", cascade = CascadeType.ALL, orphanRemoval = true)
    private CtVolume volume;

    @OneToMany(mappedBy = "surgicalCase", cascade = CascadeType.ALL, orphanRemoval = true)
    @OrderBy("occurredAt ASC")
    private List<StatusEvent> history = new ArrayList<>();

    protected SurgicalCase() {
        // for JPA
    }

    public SurgicalCase(
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
            LocalDate surgeryDate,
            Instant createdAt) {
        this.id = id;
        this.reference = reference;
        this.title = title;
        this.anatomy = anatomy;
        this.side = side;
        this.patientPseudonym = patientPseudonym;
        this.patientBirthYear = patientBirthYear;
        this.surgeonName = surgeonName;
        this.clinic = clinic;
        this.designerName = designerName;
        this.surgeryDate = surgeryDate;
        this.createdAt = createdAt;
        this.updatedAt = createdAt;
        this.status = CaseStatus.IN_DESIGN;
    }

    // ---- workflow ----------------------------------------------------------------------

    public Set<CaseAction> allowedActions() {
        return CaseWorkflow.allowedActions(status);
    }

    public boolean hasPlan() {
        return models.stream().anyMatch(model -> model.getStage() == PlanStage.PLANNED);
    }

    /**
     * Takes a workflow action and records it in the history.
     *
     * @param comment free text; required when requesting changes, optional otherwise
     * @throws IllegalTransitionException if the action does not fit the current state
     * @throws InvalidTransitionRequestException if a required comment is missing
     */
    public StatusEvent apply(CaseAction action, String comment, Instant now) {
        CaseStatus target = CaseWorkflow.next(status, action);
        String note = comment == null || comment.isBlank() ? null : comment.strip();
        if (action == CaseAction.REQUEST_CHANGES && note == null) {
            throw new InvalidTransitionRequestException("Say what the designer should change.");
        }
        if (action == CaseAction.SUBMIT_FOR_APPROVAL && !hasPlan()) {
            throw new IllegalTransitionException("This case has no planned result yet, so there is nothing to approve.");
        }
        return recordEvent(action, target, actorOf(action), note, now);
    }

    /** Appends a history entry and moves the case to {@code target}. Used directly only when seeding. */
    public StatusEvent recordEvent(CaseAction action, CaseStatus target, String actor, String comment, Instant at) {
        CaseStatus from = action == CaseAction.CREATE ? null : status;
        StatusEvent event = new StatusEvent(UUID.randomUUID(), this, from, target, action, actor, comment, at);
        history.add(event);
        status = target;
        updatedAt = at;
        return event;
    }

    /** Until the portal has sign-in, the actor is the person whose step this is. */
    private String actorOf(CaseAction action) {
        return action == CaseAction.SUBMIT_FOR_APPROVAL ? designerName : surgeonName;
    }

    // ---- content -----------------------------------------------------------------------

    public void addModel(CaseModel model) {
        models.add(model);
    }

    public void attachVolume(CtVolume volume) {
        this.volume = volume;
    }

    public void describePlan(String planNotes) {
        this.planNotes = planNotes;
    }

    public UUID getId() {
        return id;
    }

    public Long getVersion() {
        return version;
    }

    public String getReference() {
        return reference;
    }

    public String getTitle() {
        return title;
    }

    public String getAnatomy() {
        return anatomy;
    }

    public Side getSide() {
        return side;
    }

    public String getPatientPseudonym() {
        return patientPseudonym;
    }

    public int getPatientBirthYear() {
        return patientBirthYear;
    }

    public String getSurgeonName() {
        return surgeonName;
    }

    public String getClinic() {
        return clinic;
    }

    public String getDesignerName() {
        return designerName;
    }

    public CaseStatus getStatus() {
        return status;
    }

    public LocalDate getSurgeryDate() {
        return surgeryDate;
    }

    public String getPlanNotes() {
        return planNotes;
    }

    public Instant getCreatedAt() {
        return createdAt;
    }

    public Instant getUpdatedAt() {
        return updatedAt;
    }

    public List<CaseModel> getModels() {
        return Collections.unmodifiableList(models);
    }

    public CtVolume getVolume() {
        return volume;
    }

    public List<StatusEvent> getHistory() {
        return Collections.unmodifiableList(history);
    }
}
