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
import java.util.UUID;

/** A surface model of a case (bone, implant or guide). The triangles live in asset storage. */
@Entity
@Table(name = "case_model")
public class CaseModel {

    @Id
    private UUID id;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "case_id", nullable = false)
    private SurgicalCase surgicalCase;

    @Column(nullable = false)
    private int sortOrder;

    @Column(nullable = false)
    private String name;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false)
    private ModelKind kind;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false)
    private PlanStage stage;

    /** Display colour as #RRGGBB. */
    @Column(nullable = false)
    private String color;

    /** Where the binary STL is kept in {@code AssetStorage}. */
    @Column(nullable = false)
    private String storageKey;

    @Column(nullable = false)
    private int triangleCount;

    @Column(nullable = false)
    private long sizeBytes;

    protected CaseModel() {
        // for JPA
    }

    public CaseModel(
            UUID id,
            SurgicalCase surgicalCase,
            int sortOrder,
            String name,
            ModelKind kind,
            PlanStage stage,
            String color,
            String storageKey,
            int triangleCount,
            long sizeBytes) {
        this.id = id;
        this.surgicalCase = surgicalCase;
        this.sortOrder = sortOrder;
        this.name = name;
        this.kind = kind;
        this.stage = stage;
        this.color = color;
        this.storageKey = storageKey;
        this.triangleCount = triangleCount;
        this.sizeBytes = sizeBytes;
    }

    public UUID getId() {
        return id;
    }

    public int getSortOrder() {
        return sortOrder;
    }

    public String getName() {
        return name;
    }

    public ModelKind getKind() {
        return kind;
    }

    public PlanStage getStage() {
        return stage;
    }

    public String getColor() {
        return color;
    }

    public String getStorageKey() {
        return storageKey;
    }

    public int getTriangleCount() {
        return triangleCount;
    }

    public long getSizeBytes() {
        return sizeBytes;
    }
}
