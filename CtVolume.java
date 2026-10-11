package dev.trabecula.portal.cases.domain;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.FetchType;
import jakarta.persistence.Id;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.OneToOne;
import jakarta.persistence.Table;
import java.util.UUID;

/**
 * Geometry of a case's CT scan: a regular voxel grid in millimetres, with the DICOM-style
 * mapping from stored values to Hounsfield units. The voxels themselves live in asset storage
 * as gzipped little-endian int16, x running fastest, then y, then z.
 *
 * <p>The per-axis columns are named explicitly: Spring Boot's naming strategy only puts an
 * underscore before a capital that is followed by a lower-case letter, so {@code dimX} would
 * otherwise map to {@code dimx}.
 */
@Entity
@Table(name = "ct_volume")
public class CtVolume {

    @Id
    private UUID id;

    @OneToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "case_id", nullable = false, unique = true)
    private SurgicalCase surgicalCase;

    @Column(nullable = false)
    private String storageKey;

    @Column(nullable = false)
    private String description;

    @Column(name = "dim_x", nullable = false)
    private int dimX;

    @Column(name = "dim_y", nullable = false)
    private int dimY;

    @Column(name = "dim_z", nullable = false)
    private int dimZ;

    @Column(name = "spacing_x", nullable = false)
    private double spacingX;

    @Column(name = "spacing_y", nullable = false)
    private double spacingY;

    @Column(name = "spacing_z", nullable = false)
    private double spacingZ;

    @Column(name = "origin_x", nullable = false)
    private double originX;

    @Column(name = "origin_y", nullable = false)
    private double originY;

    @Column(name = "origin_z", nullable = false)
    private double originZ;

    @Column(nullable = false)
    private double rescaleSlope;

    @Column(nullable = false)
    private double rescaleIntercept;

    @Column(nullable = false)
    private int suggestedBoneThresholdHu;

    protected CtVolume() {
        // for JPA
    }

    public CtVolume(
            UUID id,
            SurgicalCase surgicalCase,
            String storageKey,
            String description,
            int[] dimensions,
            double[] spacingMm,
            double[] originMm,
            double rescaleSlope,
            double rescaleIntercept,
            int suggestedBoneThresholdHu) {
        if (dimensions.length != 3 || spacingMm.length != 3 || originMm.length != 3) {
            throw new IllegalArgumentException("A volume needs three dimensions, spacings and origin coordinates");
        }
        this.id = id;
        this.surgicalCase = surgicalCase;
        this.storageKey = storageKey;
        this.description = description;
        this.dimX = dimensions[0];
        this.dimY = dimensions[1];
        this.dimZ = dimensions[2];
        this.spacingX = spacingMm[0];
        this.spacingY = spacingMm[1];
        this.spacingZ = spacingMm[2];
        this.originX = originMm[0];
        this.originY = originMm[1];
        this.originZ = originMm[2];
        this.rescaleSlope = rescaleSlope;
        this.rescaleIntercept = rescaleIntercept;
        this.suggestedBoneThresholdHu = suggestedBoneThresholdHu;
    }

    public UUID getId() {
        return id;
    }

    public String getStorageKey() {
        return storageKey;
    }

    public String getDescription() {
        return description;
    }

    public int[] getDimensions() {
        return new int[] {dimX, dimY, dimZ};
    }

    public double[] getSpacingMm() {
        return new double[] {spacingX, spacingY, spacingZ};
    }

    public double[] getOriginMm() {
        return new double[] {originX, originY, originZ};
    }

    public double getRescaleSlope() {
        return rescaleSlope;
    }

    public double getRescaleIntercept() {
        return rescaleIntercept;
    }

    public int getSuggestedBoneThresholdHu() {
        return suggestedBoneThresholdHu;
    }
}
