package dev.trabecula.portal.cases.domain;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.FetchType;
import jakarta.persistence.Id;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.ManyToOne;
import jakarta.persistence.Table;
import java.time.Instant;
import java.util.UUID;

/** One entry of a case's audit trail. Entries are only ever added, never changed. */
@Entity
@Table(name = "case_status_event")
public class StatusEvent {

    @Id
    private UUID id;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "case_id", nullable = false)
    private SurgicalCase surgicalCase;

    /** Null for the creation of the case. */
    @Enumerated(EnumType.STRING)
    private CaseStatus fromStatus;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false)
    private CaseStatus toStatus;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false)
    private CaseAction action;

    @Column(nullable = false)
    private String actor;

    @Column(name = "comment_text")
    private String comment;

    @Column(nullable = false)
    private Instant occurredAt;

    protected StatusEvent() {
        // for JPA
    }

    StatusEvent(
            UUID id,
            SurgicalCase surgicalCase,
            CaseStatus fromStatus,
            CaseStatus toStatus,
            CaseAction action,
            String actor,
            String comment,
            Instant occurredAt) {
        this.id = id;
        this.surgicalCase = surgicalCase;
        this.fromStatus = fromStatus;
        this.toStatus = toStatus;
        this.action = action;
        this.actor = actor;
        this.comment = comment;
        this.occurredAt = occurredAt;
    }

    public UUID getId() {
        return id;
    }

    public CaseStatus getFromStatus() {
        return fromStatus;
    }

    public CaseStatus getToStatus() {
        return toStatus;
    }

    public CaseAction getAction() {
        return action;
    }

    public String getActor() {
        return actor;
    }

    public String getComment() {
        return comment;
    }

    public Instant getOccurredAt() {
        return occurredAt;
    }
}
